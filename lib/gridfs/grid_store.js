/**
 * @fileOverview GridFS is a tool for MongoDB to store files to the database.
 * Because of the restrictions of the object size the database can hold, a
 * facility to split a file into several chunks is needed. The {@link GridStore}
 * class offers a simplified api to interact with files while managing the
 * chunks of split files behind the scenes. More information about GridFS can be
 * found <a href="http://www.mongodb.org/display/DOCS/GridFS">here</a>.
 */
var Chunk = require('./chunk'),
  ObjectID = require('mongodb-core').BSON.ObjectID,
  Buffer = require('buffer').Buffer,
  fs = require('fs'),
  timers = require('timers'),
  util = require('util'),
  MongoError = require('mongodb-core').MongoError,
  inherits = util.inherits,
  Duplex = require('stream').Duplex;

var REFERENCE_BY_FILENAME = 0;
  REFERENCE_BY_ID = 1;

/**
 * A class representation of a file stored in GridFS.
 *
 * Modes
 *  - **"r"** - read only. This is the default mode.
 *  - **"w"** - write in truncate mode. Existing data will be overwriten.
 *  - **w+"** - write in edit mode (append is not guaranteed for concurrent operations)
 *
 * Options
 *  - **root** {String}, root collection to use. Defaults to **{GridStore.DEFAULT_ROOT_COLLECTION}**.
 *  - **content_type** {String}, mime type of the file. Defaults to **{GridStore.DEFAULT_CONTENT_TYPE}**.
 *  - **chunk_size** {Number}, size for the chunk. Defaults to **{Chunk.DEFAULT_CHUNK_SIZE}**.
 *  - **metadata** {Object}, arbitrary data the user wants to store.
 *  - **readPreference** {String}, the prefered read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *  - **w**, {Number/String, > -1 || 'majority' || tag name} the write concern for the operation where < 1 is no acknowlegement of write and w >= 1, w = 'majority' or tag acknowledges the write
 *  - **wtimeout**, {Number, 0} set the timeout for waiting for write concern to finish (combines with w option)
 *  - **fsync**, (Boolean, default:false) write waits for fsync before returning, from MongoDB 2.6 on, fsync cannot be combined with journal
 *  - **j**, (Boolean, default:false) write waits for journal sync before returning
 *
 * @class Represents the GridStore.
 * @param {Db} db A database instance to interact with.
 * @param {Any} [id] optional unique id for this file
 * @param {String} [filename] optional filename for this file, no unique constrain on the field
 * @param {String} mode set the mode for this file.
 * @param {Object} options optional properties to specify.
 * @return {GridStore}
 */
var GridStore = function GridStore(db, id, filename, mode, options) {
  if(!(this instanceof GridStore)) return new GridStore(db, id, filename, mode, options);
  var self = this;
  this.db = db;

  // Handle options
  if(typeof options === 'undefined') options = {};
  // Handle mode
  if(typeof mode === 'undefined') {
    mode = filename;
    filename = undefined;
  } else if(typeof mode == 'object') {
    options = mode;
    mode = filename;
    filename = undefined;
  }

  if(id instanceof ObjectID) {
    this.referenceBy = REFERENCE_BY_ID;
    this.fileId = id;
    this.filename = filename;
  } else if(typeof filename == 'undefined') {
    this.referenceBy = REFERENCE_BY_FILENAME;
    this.filename = id;
    if (mode.indexOf('w') != null) {
      this.fileId = new ObjectID();
    }
  } else {
    this.referenceBy = REFERENCE_BY_ID;
    this.fileId = id;
    this.filename = filename;
  }

  // Set up the rest
  this.mode = mode == null ? "r" : mode;
  this.options = options || {};

  // Opened
  this.isOpen = false;

  // Set the root if overridden
  this.root = this.options['root'] == null ? GridStore.DEFAULT_ROOT_COLLECTION : this.options['root'];
  this.position = 0;
  this.readPreference = this.options.readPreference || 'primary';
  this.writeConcern = _getWriteConcern(db, this.options);
  // Set default chunk size
  this.internalChunkSize = this.options['chunkSize'] == null ? Chunk.DEFAULT_CHUNK_SIZE : this.options['chunkSize'];
}

/**
 * Opens the file from the database and initialize this object. Also creates a
 * new one if file does not exist.
 *
 * @param {Function} callback this will be called after executing this method. The first parameter will contain an **{Error}** object and the second parameter will be null if an error occured. Otherwise, the first parameter will be null and the second will contain the reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.open = function(callback) {
  if( this.mode != "w" && this.mode != "w+" && this.mode != "r"){
    callback(new Error("Illegal mode " + this.mode), null);
    return;
  }

  var self = this;

  // Get the write concern
  var writeConcern = _getWriteConcern(this.db, this.options);

  // If we are writing we need to ensure we have the right indexes for md5's
  if((self.mode == "w" || self.mode == "w+")) {
    // Get files collection
    var collection = self.collection();
    // Put index on filename
    collection.ensureIndex([['filename', 1]], writeConcern, function(err, index) {
      // Get chunk collection
      var chunkCollection = self.chunkCollection();
      // Ensure index on chunk collection
      chunkCollection.ensureIndex([['files_id', 1], ['n', 1]], writeConcern, function(err, index) {
        // Open the connection
        _open(self, writeConcern, function(err, r) {
          if(err) return callback(err);
          self.isOpen = true;
          callback(err, r);
        });
      });
    });
  } else {
    // Open the gridstore
    _open(self, writeConcern, function(err, r) {
      if(err) return callback(err);
      self.isOpen = true;
      callback(err, r);
    });
  }
};

/**
 * Hidding the _open function
 * @ignore
 * @api private
 */
var _open = function(self, options, callback) {
  var collection = self.collection();
  // Create the query
  var query = self.referenceBy == REFERENCE_BY_ID ? {_id:self.fileId} : {filename:self.filename};
  query = null == self.fileId && self.filename == null ? null : query;
  options.readPreference = self.readPreference;

  // Fetch the chunks
  if(query != null) {
    collection.find(query, options, function(err, cursor) {
      if(err) return error(err);

      // Fetch the file
      cursor.nextObject(function(err, doc) {
        if(err) return error(err);

        // Check if the collection for the files exists otherwise prepare the new one
        if(doc != null) {
          self.fileId = doc._id;
          // Prefer a new filename over the existing one if this is a write
          self.filename = ((self.mode == 'r') || (self.filename == undefined)) ? doc.filename : self.filename;
          self.contentType = doc.contentType;
          self.internalChunkSize = doc.chunkSize;
          self.uploadDate = doc.uploadDate;
          self.aliases = doc.aliases;
          self.length = doc.length;
          self.metadata = doc.metadata;
          self.internalMd5 = doc.md5;
        } else if (self.mode != 'r') {
          self.fileId = self.fileId == null ? new ObjectID() : self.fileId;
          self.contentType = GridStore.DEFAULT_CONTENT_TYPE;
          self.internalChunkSize = self.internalChunkSize == null ? Chunk.DEFAULT_CHUNK_SIZE : self.internalChunkSize;
          self.length = 0;
        } else {
          self.length = 0;
          var txtId = self.fileId instanceof ObjectID ? self.fileId.toHexString() : self.fileId;
          return error(new Error((self.referenceBy == REFERENCE_BY_ID ? txtId : self.filename) + " does not exist", self));
        }

        // Process the mode of the object
        if(self.mode == "r") {
          nthChunk(self, 0, options, function(err, chunk) {
            if(err) return error(err);
            self.currentChunk = chunk;
            self.position = 0;
            callback(null, self);
          });
        } else if(self.mode == "w") {
          // Delete any existing chunks
          deleteChunks(self, options, function(err, result) {
            if(err) return error(err);
            self.currentChunk = new Chunk(self, {'n':0}, self.writeConcern);
            self.contentType = self.options['content_type'] == null ? self.contentType : self.options['content_type'];
            self.internalChunkSize = self.options['chunk_size'] == null ? self.internalChunkSize : self.options['chunk_size'];
            self.metadata = self.options['metadata'] == null ? self.metadata : self.options['metadata'];
            self.aliases = self.options['aliases'] == null ? self.aliases : self.options['aliases'];
            self.position = 0;
            callback(null, self);
          });
        } else if(self.mode == "w+") {
          nthChunk(self, lastChunkNumber(self), options, function(err, chunk) {
            if(err) return error(err);
            // Set the current chunk
            self.currentChunk = chunk == null ? new Chunk(self, {'n':0}, self.writeConcern) : chunk;
            self.currentChunk.position = self.currentChunk.data.length();
            self.metadata = self.options['metadata'] == null ? self.metadata : self.options['metadata'];
            self.aliases = self.options['aliases'] == null ? self.aliases : self.options['aliases'];
            self.position = self.length;
            callback(null, self);
          });
        }
      });
    });
  } else {
    // Write only mode
    self.fileId = null == self.fileId ? new ObjectID() : self.fileId;
    self.contentType = GridStore.DEFAULT_CONTENT_TYPE;
    self.internalChunkSize = self.internalChunkSize == null ? Chunk.DEFAULT_CHUNK_SIZE : self.internalChunkSize;
    self.length = 0;

    var collection2 = self.chunkCollection();
    // No file exists set up write mode
    if(self.mode == "w") {
      // Delete any existing chunks
      deleteChunks(self, options, function(err, result) {
        if(err) return error(err);
        self.currentChunk = new Chunk(self, {'n':0}, self.writeConcern);
        self.contentType = self.options['content_type'] == null ? self.contentType : self.options['content_type'];
        self.internalChunkSize = self.options['chunk_size'] == null ? self.internalChunkSize : self.options['chunk_size'];
        self.metadata = self.options['metadata'] == null ? self.metadata : self.options['metadata'];
        self.aliases = self.options['aliases'] == null ? self.aliases : self.options['aliases'];
        self.position = 0;
        callback(null, self);
      });
    } else if(self.mode == "w+") {
      nthChunk(self, lastChunkNumber(self), options, function(err, chunk) {
        if(err) return error(err);
        // Set the current chunk
        self.currentChunk = chunk == null ? new Chunk(self, {'n':0}, self.writeConcern) : chunk;
        self.currentChunk.position = self.currentChunk.data.length();
        self.metadata = self.options['metadata'] == null ? self.metadata : self.options['metadata'];
        self.aliases = self.options['aliases'] == null ? self.aliases : self.options['aliases'];
        self.position = self.length;
        callback(null, self);
      });
    }
  }

  // only pass error to callback once
  function error (err) {
    if(error.err) return;
    callback(error.err = err);
  }
};

/**
 * Stores a file from the file system to the GridFS database.
 *
 * @param {String|Buffer|FileHandle} file the file to store.
 * @param {Function} callback this will be called after this method is executed. The first parameter will be null and the the second will contain the reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.writeFile = function (file, callback) {
  var self = this;
  if (typeof file === 'string') {
    fs.open(file, 'r', function (err, fd) {
      if(err) return callback(err);
      self.writeFile(fd, callback);
    });
    return;
  }

  self.open(function (err, self) {
    if(err) return callback(err, self);

    fs.fstat(file, function (err, stats) {
      if(err) return callback(err, self);

      var offset = 0;
      var index = 0;
      var numberOfChunksLeft = Math.min(stats.size / self.chunkSize);

      // Write a chunk
      var writeChunk = function() {
        fs.read(file, self.chunkSize, offset, 'binary', function(err, data, bytesRead) {
          if(err) return callback(err, self);

          offset = offset + bytesRead;

          // Create a new chunk for the data
          var chunk = new Chunk(self, {n:index++}, self.writeConcern);
          chunk.write(data, function(err, chunk) {
            if(err) return callback(err, self);

            chunk.save({}, function(err, result) {
              if(err) return callback(err, self);

              self.position = self.position + data.length;

              // Point to current chunk
              self.currentChunk = chunk;

              if(offset >= stats.size) {
                fs.close(file);
                self.close(function(err, result) {
                  if(err) return callback(err, self);
                  return callback(null, self);
                });
              } else {
                return process.nextTick(writeChunk);
              }
            });
          });
        });
      }

      // Process the first write
      process.nextTick(writeChunk);
    });
  });
};

/**
 * Writes some data. This method will work properly only if initialized with mode
 * "w" or "w+".
 *
 * @param string {string} The data to write.
 * @param close {boolean=false} opt_argument Closes this file after writing if
 *     true.
 * @param callback {function(*, GridStore)} This will be called after executing
 *     this method. The first parameter will contain null and the second one
 *     will contain a reference to this object.
 *
 * @ignore
 * @api private
 */
var writeBuffer = function(self, buffer, close, callback) {
  if(typeof close === "function") { callback = close; close = null; }
  var finalClose = typeof close == 'boolean' ? close : false;

  if(self.mode[0] != "w") {
    callback(new Error((self.referenceBy == REFERENCE_BY_ID ? self.toHexString() : self.filename) + " not opened for writing"), null);
  } else {
    if(self.currentChunk.position + buffer.length >= self.chunkSize) {
      // Write out the current Chunk and then keep writing until we have less data left than a chunkSize left
      // to a new chunk (recursively)
      var previousChunkNumber = self.currentChunk.chunkNumber;
      var leftOverDataSize = self.chunkSize - self.currentChunk.position;
      var firstChunkData = buffer.slice(0, leftOverDataSize);
      var leftOverData = buffer.slice(leftOverDataSize);
      // A list of chunks to write out
      var chunksToWrite = [self.currentChunk.write(firstChunkData)];
      // If we have more data left than the chunk size let's keep writing new chunks
      while(leftOverData.length >= self.chunkSize) {
        // Create a new chunk and write to it
        var newChunk = new Chunk(self, {'n': (previousChunkNumber + 1)}, self.writeConcern);
        var firstChunkData = leftOverData.slice(0, self.chunkSize);
        leftOverData = leftOverData.slice(self.chunkSize);
        // Update chunk number
        previousChunkNumber = previousChunkNumber + 1;
        // Write data
        newChunk.write(firstChunkData);
        // Push chunk to save list
        chunksToWrite.push(newChunk);
      }

      // Set current chunk with remaining data
      self.currentChunk = new Chunk(self, {'n': (previousChunkNumber + 1)}, self.writeConcern);
      // If we have left over data write it
      if(leftOverData.length > 0) self.currentChunk.write(leftOverData);

      // Update the position for the gridstore
      self.position = self.position + buffer.length;
      // Total number of chunks to write
      var numberOfChunksToWrite = chunksToWrite.length;

      for(var i = 0; i < chunksToWrite.length; i++) {
        chunksToWrite[i].save({}, function(err, result) {
          if(err) return callback(err);

          numberOfChunksToWrite = numberOfChunksToWrite - 1;

          if(numberOfChunksToWrite <= 0) {
            // We care closing the file before returning
            if(finalClose) {
              return self.close(function(err, result) {
                callback(err, self);
              });
            }
            
            // Return normally
            return callback(null, self);
          }
        });
      }
    } else {
      // Update the position for the gridstore
      self.position = self.position + buffer.length;
      // We have less data than the chunk size just write it and callback
      self.currentChunk.write(buffer);
      // We care closing the file before returning
      if(finalClose) {
        return self.close(function(err, result) {
          callback(err, self);
        });
      }
      // Return normally
      return callback(null, self);
    }
  }
};

/**
 * Creates a mongoDB object representation of this object.
 *
 * @param callback {function(object)} This will be called after executing this
 *     method. The object will be passed to the first parameter and will have
 *     the structure:
 *
 *        <pre><code>
 *        {
 *          '_id' : , // {number} id for this file
 *          'filename' : , // {string} name for this file
 *          'contentType' : , // {string} mime type for this file
 *          'length' : , // {number} size of this file?
 *          'chunksize' : , // {number} chunk size used by this file
 *          'uploadDate' : , // {Date}
 *          'aliases' : , // {array of string}
 *          'metadata' : , // {string}
 *        }
 *        </code></pre>
 *
 * @ignore
 * @api private
 */
var buildMongoObject = function(self, callback) {
  // Calcuate the length
  var mongoObject = {
    '_id': self.fileId,
    'filename': self.filename,
    'contentType': self.contentType,
    'length': self.position ? self.position : 0,
    'chunkSize': self.chunkSize,
    'uploadDate': self.uploadDate,
    'aliases': self.aliases,
    'metadata': self.metadata
  };

  var md5Command = {filemd5:self.fileId, root:self.root};
  self.db.command(md5Command, function(err, results) {
    if(err) return callback(err);

    mongoObject.md5 = results.md5;
    callback(null, mongoObject);
  });
};

/**
 * Saves this file to the database. This will overwrite the old entry if it
 * already exists. This will work properly only if mode was initialized to
 * "w" or "w+".
 *
 * @param {Function} callback this will be called after executing this method. Passes an **{Error}** object to the first parameter and null to the second if an error occured. Otherwise, passes null to the first and a reference to this object to the second.
 * @return {null}
 * @api public
 */
GridStore.prototype.close = function(callback) {
  var self = this;

  if(self.mode[0] == "w") {
    // Set up options
    var options = self.writeConcern;

    if(self.currentChunk != null && self.currentChunk.position > 0) {
      self.currentChunk.save({}, function(err, chunk) {
        if(err && typeof callback == 'function') return callback(err);

        self.collection(function(err, files) {
          if(err && typeof callback == 'function') return callback(err);

          // Build the mongo object
          if(self.uploadDate != null) {
            files.remove({'_id':self.fileId}, self.writeConcern, function(err, collection) {
              if(err && typeof callback == 'function') return callback(err);

              buildMongoObject(self, function(err, mongoObject) {
                if(err) {
                  if(typeof callback == 'function') return callback(err); else throw err;
                }

                files.save(mongoObject, options, function(err) {
                  if(typeof callback == 'function')
                    callback(err, mongoObject);
                });
              });
            });
          } else {
            self.uploadDate = new Date();
            buildMongoObject(self, function(err, mongoObject) {
              if(err) {
                if(typeof callback == 'function') return callback(err); else throw err;
              }

              files.save(mongoObject, options, function(err) {
                if(typeof callback == 'function')
                  callback(err, mongoObject);
              });
            });
          }
        });
      });
    } else {
      self.collection(function(err, files) {
        if(err && typeof callback == 'function') return callback(err);

        self.uploadDate = new Date();
        buildMongoObject(self, function(err, mongoObject) {
          if(err) {
            if(typeof callback == 'function') return callback(err); else throw err;
          }

          files.save(mongoObject, options, function(err) {
            if(typeof callback == 'function')
              callback(err, mongoObject);
          });
        });
      });
    }
  } else if(self.mode[0] == "r") {
    if(typeof callback == 'function')
      callback(null, null);
  } else {
    if(typeof callback == 'function')
      callback(new Error("Illegal mode " + self.mode), null);
  }
};

/**
 * Gets the nth chunk of this file.
 *
 * @param chunkNumber {number} The nth chunk to retrieve.
 * @param callback {function(*, Chunk|object)} This will be called after
 *     executing this method. null will be passed to the first parameter while
 *     a new {@link Chunk} instance will be passed to the second parameter if
 *     the chunk was found or an empty object {} if not.
 *
 * @ignore
 * @api private
 */
var nthChunk = function(self, chunkNumber, options, callback) {
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }

  options = options || self.writeConcern;
  options.readPreference = self.readPreference;
  // Get the nth chunk
  self.chunkCollection().find({'files_id':self.fileId, 'n':chunkNumber}, options, function(err, cursor) {
    if(err) return callback(err);

    cursor.nextObject(function(err, chunk) {
      if(err) return callback(err);

      var finalChunk = chunk == null ? {} : chunk;
      callback(null, new Chunk(self, finalChunk, self.writeConcern));
    });
  });
};

/**
 *
 * @ignore
 * @api private
 */
GridStore.prototype._nthChunk = function(chunkNumber, callback) {
  nthChunk(this, chunkNumber, callback);
}

/**
 * @return {Number} The last chunk number of this file.
 *
 * @ignore
 * @api private
 */
var lastChunkNumber = function(self) {
  return Math.floor((self.length ? self.length - 1 : 0)/self.chunkSize);
};

/**
 * Retrieve this file's chunks collection.
 *
 * @param {Function} callback this will be called after executing this method. An exception object will be passed to the first parameter when an error occured or null otherwise. A new **{Collection}** object will be passed to the second parameter if no error occured.
 * @return {null}
 * @api public
 */
GridStore.prototype.chunkCollection = function(callback) {
  if(typeof callback == 'function')
    return this.db.collection((this.root + ".chunks"), callback);
  return this.db.collection((this.root + ".chunks"));
};

/**
 * Deletes all the chunks of this file in the database.
 *
 * @param callback {function(*, boolean)} This will be called after this method
 *     executes. Passes null to the first and true to the second argument.
 *
 * @ignore
 * @api private
 */
var deleteChunks = function(self, options, callback) {
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }

  options = options || self.writeConcern;

  if(self.fileId != null) {
    self.chunkCollection().remove({'files_id':self.fileId}, options, function(err, result) {
      if(err) return callback(err, false);
      callback(null, true);
    });
  } else {
    callback(null, true);
  }
};

/**
 * Deletes all the chunks of this file in the database.
 *
 * @param {Function} callback this will be called after this method executes. Passes null to the first and true to the second argument.
 * @return {null}
 * @api public
 */
GridStore.prototype.unlink = function(callback) {
  var self = this;
  deleteChunks(this, function(err) {
    if(err!==null) {
      err.message = "at deleteChunks: " + err.message;
      return callback(err);
    }

    self.collection(function(err, collection) {
      if(err!==null) {
        err.message = "at collection: " + err.message;
        return callback(err);
      }

      collection.remove({'_id':self.fileId}, self.writeConcern, function(err) {
        callback(err, self);
      });
    });
  });
};

/**
 * Retrieves the file collection associated with this object.
 *
 * @param {Function} callback this will be called after executing this method. An exception object will be passed to the first parameter when an error occured or null otherwise. A new **{Collection}** object will be passed to the second parameter if no error occured.
 * @return {null}
 * @api public
 */
GridStore.prototype.collection = function(callback) {
  if(typeof callback == 'function')
    this.db.collection(this.root + ".files", callback);
  return this.db.collection(this.root + ".files");
};

/**
 * Reads the data of this file.
 *
 * @param {String} [separator] the character to be recognized as the newline separator.
 * @param {Function} callback This will be called after this method is executed. The first parameter will be null and the second parameter will contain an array of strings representing the entire data, each element representing a line including the separator character.
 * @return {null}
 * @api public
 */
GridStore.prototype.readlines = function(separator, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  separator = args.length ? args.shift() : "\n";

  this.read(function(err, data) {
    if(err) return callback(err);

    var items = data.toString().split(separator);
    items = items.length > 0 ? items.splice(0, items.length - 1) : [];
    for(var i = 0; i < items.length; i++) {
      items[i] = items[i] + separator;
    }

    callback(null, items);
  });
};

/**
 * Deletes all the chunks of this file in the database if mode was set to "w" or
 * "w+" and resets the read/write head to the initial position.
 *
 * @param {Function} callback this will be called after executing this method. The first parameter will contain null and the second one will contain a reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.rewind = function(callback) {
  var self = this;

  if(this.currentChunk.chunkNumber != 0) {
    if(this.mode[0] == "w") {
      deleteChunks(self, function(err, gridStore) {
        if(err) return callback(err);
        self.currentChunk = new Chunk(self, {'n': 0}, self.writeConcern);
        self.position = 0;
        callback(null, self);
      });
    } else {
      self.currentChunk(0, function(err, chunk) {
        if(err) return callback(err);
        self.currentChunk = chunk;
        self.currentChunk.rewind();
        self.position = 0;
        callback(null, self);
      });
    }
  } else {
    self.currentChunk.rewind();
    self.position = 0;
    callback(null, self);
  }
};

/**
 * Retrieves the contents of this file and advances the read/write head. Works with Buffers only.
 *
 * There are 3 signatures for this method:
 *
 * (callback)
 * (length, callback)
 * (length, buffer, callback)
 *
 * @param {Number} [length] the number of characters to read. Reads all the characters from the read/write head to the EOF if not specified.
 * @param {String|Buffer} [buffer] a string to hold temporary data. This is used for storing the string data read so far when recursively calling this method.
 * @param {Function} callback this will be called after this method is executed. null will be passed to the first parameter and a string containing the contents of the buffer concatenated with the contents read from this file will be passed to the second.
 * @return {null}
 * @api public
 */
GridStore.prototype.read = function(length, buffer, callback) {
  var self = this;

  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  length = args.length ? args.shift() : null;
  buffer = args.length ? args.shift() : null;

  // The data is a c-terminated string and thus the length - 1
  var finalLength = length == null ? self.length - self.position : length;
  var finalBuffer = buffer == null ? new Buffer(finalLength) : buffer;
  // Add a index to buffer to keep track of writing position or apply current index
  finalBuffer._index = buffer != null && buffer._index != null ? buffer._index : 0;

  if((self.currentChunk.length() - self.currentChunk.position + finalBuffer._index) >= finalLength) {
    var slice = self.currentChunk.readSlice(finalLength - finalBuffer._index);
    // Copy content to final buffer
    slice.copy(finalBuffer, finalBuffer._index);
    // Update internal position
    self.position = self.position + finalBuffer.length;
    // Check if we don't have a file at all
    if(finalLength == 0 && finalBuffer.length == 0) return callback(new Error("File does not exist"), null);
    // Else return data
    return callback(null, finalBuffer);
  }

  // Read the next chunk
  var slice = self.currentChunk.readSlice(self.currentChunk.length() - self.currentChunk.position);
  // Copy content to final buffer
  slice.copy(finalBuffer, finalBuffer._index);
  // Update index position
  finalBuffer._index += slice.length;

  // Load next chunk and read more
  nthChunk(self, self.currentChunk.chunkNumber + 1, function(err, chunk) {
    if(err) return callback(err);

    if(chunk.length() > 0) {
      self.currentChunk = chunk;
      self.read(length, finalBuffer, callback);
    } else {
      if(finalBuffer._index > 0) {
        callback(null, finalBuffer)
      } else {
        callback(new Error("no chunks found for file, possibly corrupt"), null);
      }
    }
  });
}

/**
 * Retrieves the position of the read/write head of this file.
 *
 * @param {Function} callback This gets called after this method terminates. null is passed to the first parameter and the position is passed to the second.
 * @return {null}
 * @api public
 */
GridStore.prototype.tell = function(callback) {
  callback(null, this.position);
};

/**
 * Moves the read/write head to a new location.
 *
 * There are 3 signatures for this method
 *
 * Seek Location Modes
 *  - **GridStore.IO_SEEK_SET**, **(default)** set the position from the start of the file.
 *  - **GridStore.IO_SEEK_CUR**, set the position from the current position in the file.
 *  - **GridStore.IO_SEEK_END**, set the position from the end of the file.
 *
 * @param {Number} [position] the position to seek to
 * @param {Number} [seekLocation] seek mode. Use one of the Seek Location modes.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain null and the second one will contain a reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.seek = function(position, seekLocation, callback) {
  var self = this;

  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  seekLocation = args.length ? args.shift() : null;

  var seekLocationFinal = seekLocation == null ? GridStore.IO_SEEK_SET : seekLocation;
  var finalPosition = position;
  var targetPosition = 0;

  // Calculate the position
  if(seekLocationFinal == GridStore.IO_SEEK_CUR) {
    targetPosition = self.position + finalPosition;
  } else if(seekLocationFinal == GridStore.IO_SEEK_END) {
    targetPosition = self.length + finalPosition;
  } else {
    targetPosition = finalPosition;
  }

  // Get the chunk
  var newChunkNumber = Math.floor(targetPosition/self.chunkSize);
  if(newChunkNumber != self.currentChunk.chunkNumber) {
    var seekChunk = function() {
      nthChunk(self, newChunkNumber, function(err, chunk) {
        self.currentChunk = chunk;
        self.position = targetPosition;
        self.currentChunk.position = (self.position % self.chunkSize);
        callback(err, self);
      });
    };

    if(self.mode[0] == 'w') {
      self.currentChunk.save({}, function(err) {
        if(err) return callback(err);
        seekChunk();
      });
    } else {
      seekChunk();
    }
  } else {
    self.position = targetPosition;
    self.currentChunk.position = (self.position % self.chunkSize);
    callback(null, self);
  }
};

/**
 * Verify if the file is at EOF.
 *
 * @return {Boolean} true if the read/write head is at the end of this file.
 * @api public
 */
GridStore.prototype.eof = function() {
  return this.position == this.length ? true : false;
};

/**
 * Retrieves a single character from this file.
 *
 * @param {Function} callback this gets called after this method is executed. Passes null to the first parameter and the character read to the second or null to the second if the read/write head is at the end of the file.
 * @return {null}
 * @api public
 */
GridStore.prototype.getc = function(callback) {
  var self = this;

  if(self.eof()) {
    callback(null, null);
  } else if(self.currentChunk.eof()) {
    nthChunk(self, self.currentChunk.chunkNumber + 1, function(err, chunk) {
      self.currentChunk = chunk;
      self.position = self.position + 1;
      callback(err, self.currentChunk.getc());
    });
  } else {
    self.position = self.position + 1;
    callback(null, self.currentChunk.getc());
  }
};

/**
 * Writes a string to the file with a newline character appended at the end if
 * the given string does not have one.
 *
 * @param {String} string the string to write.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain null and the second one will contain a reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.puts = function(string, callback) {
  var finalString = string.match(/\n$/) == null ? string + "\n" : string;
  this.write(finalString, callback);
};

/**
 * Returns read stream based on this GridStore file
 *
 * Events
 *  - **data** {function(item) {}} the data event triggers when a document is ready.
 *  - **end** {function() {}} the end event triggers when there is no more documents available.
 *  - **close** {function() {}} the close event triggers when the stream is closed.
 *  - **error** {function(err) {}} the error event triggers if an error happens.
 *
 * @param {Boolean} autoclose if true current GridStore will be closed when EOF and 'close' event will be fired
 * @return {null}
 * @api public
 */
GridStore.prototype.stream = function(autoclose) {
  // return new ReadStream(autoclose, this);
  return new GridStoreStream(this);
};

/**
* The collection to be used for holding the files and chunks collection.
*
* @classconstant DEFAULT_ROOT_COLLECTION
**/
GridStore.DEFAULT_ROOT_COLLECTION = 'fs';

/**
* Default file mime type
*
* @classconstant DEFAULT_CONTENT_TYPE
**/
GridStore.DEFAULT_CONTENT_TYPE = 'binary/octet-stream';

/**
* Seek mode where the given length is absolute.
*
* @classconstant IO_SEEK_SET
**/
GridStore.IO_SEEK_SET = 0;

/**
* Seek mode where the given length is an offset to the current read/write head.
*
* @classconstant IO_SEEK_CUR
**/
GridStore.IO_SEEK_CUR = 1;

/**
* Seek mode where the given length is an offset to the end of the file.
*
* @classconstant IO_SEEK_END
**/
GridStore.IO_SEEK_END = 2;

/**
 * Checks if a file exists in the database.
 *
 * Options
 *  - **readPreference** {String}, the prefered read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST).
 *
 * @param {Db} db the database to query.
 * @param {String} name the name of the file to look for.
 * @param {String} [rootCollection] the root collection that holds the files and chunks collection. Defaults to **{GridStore.DEFAULT_ROOT_COLLECTION}**.
 * @param {Function} callback this will be called after this method executes. Passes null to the first and passes true to the second if the file exists and false otherwise.
 * @return {null}
 * @api public
 */
GridStore.exist = function(db, fileIdObject, rootCollection, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  rootCollection = args.length ? args.shift() : null;
  options = args.length ? args.shift() : {};

  // Establish read preference
  var readPreference = options.readPreference || 'primary';
  // Fetch collection
  var rootCollectionFinal = rootCollection != null ? rootCollection : GridStore.DEFAULT_ROOT_COLLECTION;
  db.collection(rootCollectionFinal + ".files", function(err, collection) {
    if(err) return callback(err);

    // Build query
    var query = (typeof fileIdObject == 'string' || Object.prototype.toString.call(fileIdObject) == '[object RegExp]' )
      ? {'filename':fileIdObject}
      : {'_id':fileIdObject};    // Attempt to locate file

    collection.find(query, {readPreference:readPreference}, function(err, cursor) {
      if(err) return callback(err);

      cursor.nextObject(function(err, item) {
        if(err) return callback(err);
        callback(null, item == null ? false : true);
      });
    });
  });
};

/**
 * Gets the list of files stored in the GridFS.
 *
 * @param {Db} db the database to query.
 * @param {String} [rootCollection] the root collection that holds the files and chunks collection. Defaults to **{GridStore.DEFAULT_ROOT_COLLECTION}**.
 * @param {Function} callback this will be called after this method executes. Passes null to the first and passes an array of strings containing the names of the files.
 * @return {null}
 * @api public
 */
GridStore.list = function(db, rootCollection, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  rootCollection = args.length ? args.shift() : null;
  options = args.length ? args.shift() : {};

  // Ensure we have correct values
  if(rootCollection != null && typeof rootCollection == 'object') {
    options = rootCollection;
    rootCollection = null;
  }

  // Establish read preference
  var readPreference = options.readPreference || 'primary';
  // Check if we are returning by id not filename
  var byId = options['id'] != null ? options['id'] : false;
  // Fetch item
  var rootCollectionFinal = rootCollection != null ? rootCollection : GridStore.DEFAULT_ROOT_COLLECTION;
  var items = [];
  db.collection((rootCollectionFinal + ".files"), function(err, collection) {
    if(err) return callback(err);

    collection.find({}, {readPreference:readPreference}, function(err, cursor) {
      if(err) return callback(err);

      cursor.each(function(err, item) {
        if(item != null) {
          items.push(byId ? item._id : item.filename);
        } else {
          callback(err, items);
        }
      });
    });
  });
};

/**
 * Reads the contents of a file.
 *
 * This method has the following signatures
 *
 * (db, name, callback)
 * (db, name, length, callback)
 * (db, name, length, offset, callback)
 * (db, name, length, offset, options, callback)
 *
 * @param {Db} db the database to query.
 * @param {String} name the name of the file.
 * @param {Number} [length] the size of data to read.
 * @param {Number} [offset] the offset from the head of the file of which to start reading from.
 * @param {Object} [options] the options for the file.
 * @param {Function} callback this will be called after this method executes. A string with an error message will be passed to the first parameter when the length and offset combination exceeds the length of the file while an Error object will be passed if other forms of error occured, otherwise, a string is passed. The second parameter will contain the data read if successful or null if an error occured.
 * @return {null}
 * @api public
 */
GridStore.read = function(db, name, length, offset, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  length = args.length ? args.shift() : null;
  offset = args.length ? args.shift() : null;
  options = args.length ? args.shift() : null;

  new GridStore(db, name, "r", options).open(function(err, gridStore) {
    if(err) return callback(err);
    // Make sure we are not reading out of bounds
    if(offset && offset >= gridStore.length) return callback("offset larger than size of file", null);
    if(length && length > gridStore.length) return callback("length is larger than the size of the file", null);
    if(offset && length && (offset + length) > gridStore.length) return callback("offset and length is larger than the size of the file", null);

    if(offset != null) {
      gridStore.seek(offset, function(err, gridStore) {
        if(err) return callback(err);
        gridStore.read(length, callback);
      });
    } else {
      gridStore.read(length, callback);
    }
  });
};

/**
 * Reads the data of this file.
 *
 * @param {Db} db the database to query.
 * @param {String} name the name of the file.
 * @param {String} [separator] the character to be recognized as the newline separator.
 * @param {Object} [options] file options.
 * @param {Function} callback this will be called after this method is executed. The first parameter will be null and the second parameter will contain an array of strings representing the entire data, each element representing a line including the separator character.
 * @return {null}
 * @api public
 */
GridStore.readlines = function(db, name, separator, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  separator = args.length ? args.shift() : null;
  options = args.length ? args.shift() : null;

  var finalSeperator = separator == null ? "\n" : separator;
  new GridStore(db, name, "r", options).open(function(err, gridStore) {
    if(err) return callback(err);
    gridStore.readlines(finalSeperator, callback);
  });
};

/**
 * Deletes the chunks and metadata information of a file from GridFS.
 *
 * @param {Db} db the database to interact with.
 * @param {String|Array} names the name/names of the files to delete.
 * @param {Object} [options] the options for the files.
 * @callback {Function} this will be called after this method is executed. The first parameter will contain an Error object if an error occured or null otherwise. The second parameter will contain a reference to this object.
 * @return {null}
 * @api public
 */
GridStore.unlink = function(db, names, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  options = args.length ? args.shift() : {};

  // Get the write concern
  var writeConcern = _getWriteConcern(db, options);

  // List of names
  if(names.constructor == Array) {
    var tc = 0;
    for(var i = 0; i < names.length; i++) {
      ++tc;
      GridStore.unlink(db, names[i], options, function(result) {
        if(--tc == 0) {
            callback(null, self);
        }
      });
    }
  } else {
    new GridStore(db, names, "w", options).open(function(err, gridStore) {
      if(err) return callback(err);
      deleteChunks(gridStore, function(err, result) {
        if(err) return callback(err);
        gridStore.collection(function(err, collection) {
          if(err) return callback(err);
          collection.remove({'_id':gridStore.fileId}, writeConcern, function(err, result) {
            callback(err, self);
          });
        });
      });
    });
  }
};

/**
 * Returns the current chunksize of the file.
 *
 * @field chunkSize
 * @type {Number}
 * @getter
 * @setter
 * @property return number of bytes in the current chunkSize.
 */
Object.defineProperty(GridStore.prototype, "chunkSize", { enumerable: true
 , get: function () {
     return this.internalChunkSize;
   }
 , set: function(value) {
     if(!(this.mode[0] == "w" && this.position == 0 && this.uploadDate == null)) {
       this.internalChunkSize = this.internalChunkSize;
     } else {
       this.internalChunkSize = value;
     }
   }
});

/**
 * The md5 checksum for this file.
 *
 * @field md5
 * @type {Number}
 * @getter
 * @setter
 * @property return this files md5 checksum.
 */
Object.defineProperty(GridStore.prototype, "md5", { enumerable: true
 , get: function () {
     return this.internalMd5;
   }
});

/**
 *  Handles the normal writes to gridstore
 *  @ignore
 */
var _writeNormal = function(self, data, close, callback) {
  // If we have a buffer write it using the writeBuffer method
  if(Buffer.isBuffer(data)) {
    return writeBuffer(self, data, close, callback);
  } else {
    return writeBuffer(self, new Buffer(data, 'binary'), close, callback);
  }
}

/**
 * Writes some data. This method will work properly only if initialized with mode "w" or "w+".
 *
 * @param {String|Buffer} data the data to write.
 * @param {Boolean} [close] closes this file after writing if set to true.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain null and the second one will contain a reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.write = function write(data, close, callback) {
  return _writeNormal(this, data, close, callback);
}

/**
 *  Handles the destroy part of a stream
 *  @ignore
 */
GridStore.prototype.destroy = function destroy() {
  // close and do not emit any more events. queued data is not sent.
  if(!this.writable) return;
  this.readable = false;
  if(this.writable) {
    this.writable = false;
    this._q.length = 0;
    this.emit('close');
  }
}

/**
 * @ignore
 */
var _setWriteConcernHash = function(options) {
  var finalOptions = {};
  if(options.w != null) finalOptions.w = options.w;  
  if(options.journal == true) finalOptions.j = options.journal;
  if(options.j == true) finalOptions.j = options.j;
  if(options.fsync == true) finalOptions.fsync = options.fsync;
  if(options.wtimeout != null) finalOptions.wtimeout = options.wtimeout;  
  return finalOptions;
}

/**
 * @ignore
 */
var _getWriteConcern = function(self, options) {
  // Final options
  var finalOptions = {w:1};
  options = options || {};

  // Local options verification
  if(options.w != null || typeof options.j == 'boolean' || typeof options.journal == 'boolean' || typeof options.fsync == 'boolean') {
    finalOptions = _setWriteConcernHash(options);
  } else if(options.safe != null && typeof options.safe == 'object') {
    finalOptions = _setWriteConcernHash(options.safe);
  } else if(typeof options.safe == "boolean") {
    finalOptions = {w: (options.safe ? 1 : 0)};
  } else if(self.options.w != null || typeof self.options.j == 'boolean' || typeof self.options.journal == 'boolean' || typeof self.options.fsync == 'boolean') {
    finalOptions = _setWriteConcernHash(self.options);
  } else if(self.safe.w != null || typeof self.safe.j == 'boolean' || typeof self.safe.journal == 'boolean' || typeof self.safe.fsync == 'boolean') {
    finalOptions = _setWriteConcernHash(self.safe);
  } else if(typeof self.safe == "boolean") {
    finalOptions = {w: (self.safe ? 1 : 0)};
  }

  // Ensure we don't have an invalid combination of write concerns
  if(finalOptions.w < 1 
    && (finalOptions.journal == true || finalOptions.j == true || finalOptions.fsync == true)) throw new Error("No acknowledgement using w < 1 cannot be combined with journal:true or fsync:true");

  // Return the options
  return finalOptions;
}

//
// Grid store stream
var GridStoreStream = function(gs) {
  var self = this;
  // Initialize the duplex stream
  Duplex.call(this);  

  // Save current pipe function
  var _pipe = this.pipe;

  // End called
  var endCalled = false;

  // If we have a seek
  var totalBytesToRead = gs.length - gs.position;
  var seekPosition = gs.position;

  // Set up override
  this.pipe = function(destination) {
    gs.open(function(err) {
      if(err) return self.emit('error', err);
      totalBytesToRead = gs.length - gs.position;
      _pipe.apply(self, [destination]);
    });
  }

  // Called by stream
  this._read = function(n) {
    // Set read length
    var length = gs.length < gs.chunkSize ? gs.length - seekPosition : gs.chunkSize;
    // Read data
    gs.read(length, function(err, buffer) {
      // Stream is closed      
      if(endCalled || buffer == null) return self.push(null);
      // Remove bytes read
      if(buffer.length <= totalBytesToRead) {
        totalBytesToRead = totalBytesToRead - buffer.length;
        self.push(buffer);
      } else if(buffer.length > totalBytesToRead) {
        self.push(buffer.slice(0, buffer._index));
        totalBytesToRead = totalBytesToRead - buffer._index;
      }

      // Finished reading
      if(totalBytesToRead <= 0) {
        endCalled = true;
      }
    });
  }

  this.destroy = function() {
    this.pause();
    endCalled = true;
    gs.close();
    self.emit('end');
  }

  this.write = function(chunk, encoding, callback) {
    if(endCalled) return self.emit('error', new MongoError('attempting to write to stream after end called'))
    // Do we have to open the gridstore
    if(!gs.isOpen) {
      gs.open(function() {
        gs.isOpen = true;
        gs.write(chunk, function() {
          self.emit('drain');
        });        
      });
    } else {
      gs.write(chunk, function() {
        self.emit('drain');
      });
    }

    return false;
  }

  this.end = function(chunk, encoding, callback) {
    var args = Array.prototype.slice.call(arguments, 0);
    callback = args.pop();
    chunk = args.length ? args.shift() : null;
    encoding = args.length ? args.shift() : null;
    endCalled = true;

    if(chunk) {
      gs.write(chunk, function() {
        gs.close(function() {
          if(typeof callback == 'function') callback();
          self.emit('end')
        });
      });      
    }

    gs.close(function() {
      if(typeof callback == 'function') callback();      
      self.emit('end')
    });    
  }
}

//
// Inherit duplex
inherits(GridStoreStream, Duplex);

/**
 * @ignore
 * @api private
 */
module.exports = GridStore;
