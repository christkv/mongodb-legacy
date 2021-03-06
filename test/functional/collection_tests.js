// var Step = require('step');

/**
 * Example of a simple document save with safe set to false
 *
 * @_class collection
 * @_function save
 * @ignore
 */
exports.shouldCorrectlySaveASimpleDocument = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Fetch the collection
      var collection = db.collection("save_a_simple_document");
      // Save a document with no safe option
      collection.save({hello:'world'});

      // Wait for a second
      setTimeout(function() {

        // Find the saved document
        collection.findOne({hello:'world'}, function(err, item) {
          test.equal(null, err);
          test.equal('world', item.hello);
          db.close();
          test.done();
        });
      }, 2000);
    });
    // DOC_END
  }
}

/**
 * Example of a simple document save and then resave with safe set to true
 *
 * @_class collection
 * @_function save
 * @ignore
 */
exports.shouldCorrectlySaveASimpleDocumentModifyItAndResaveIt = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Fetch the collection
      var collection = db.collection("save_a_simple_document_modify_it_and_resave_it");

      // Save a document with no safe option
      collection.save({hello:'world'}, configuration.writeConcernMax(), function(err, result) {

        // Find the saved document
        collection.findOne({hello:'world'}, function(err, item) {
          test.equal(null, err);
          test.equal('world', item.hello);

          // Update the document
          item['hello2'] = 'world2';

          // Save the item with the additional field
          collection.save(item, configuration.writeConcernMax(), function(err, result) {

            // Find the changed document
            collection.findOne({hello:'world'}, function(err, item) {
              test.equal(null, err);
              test.equal('world', item.hello);
              test.equal('world2', item.hello2);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // DOC_END
  }
}

/**
 * @ignore
 */
exports.shouldCorrectExecuteBasicCollectionMethods = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, client) {    
      var collection = client.createCollection('test_collection_methods', function(err, collection) {
        // Verify that all the result are correct coming back (should contain the value ok)
        test.equal('test_collection_methods', collection.collectionName);
        // Let's check that the collection was created correctly
        db.collectionNames(function(err, documents) {
          var found = false;
          documents.forEach(function(document) {
            if(document.name == "integration_tests_.test_collection_methods") found = true;
          });
          test.ok(true, found);

          // Let's check that the collection was created correctly
          db.collectionNames({namesOnly:true}, function(err, names) {
            test.ok(typeof names[0] == 'string');

            // Rename the collection and check that it's gone
            db.renameCollection("test_collection_methods", "test_collection_methods2", function(err, reply) {
              test.equal(null, err);
              // Drop the collection and check that it's gone
              db.dropCollection("test_collection_methods2", function(err, result) {
                test.equal(true, result);
              });
            });

            db.createCollection('test_collection_methods3', function(err, collection) {
              // Verify that all the result are correct coming back (should contain the value ok)
              test.equal('test_collection_methods3', collection.collectionName);
            
              db.createCollection('test_collection_methods4', function(err, collection) {
                // Verify that all the result are correct coming back (should contain the value ok)
                test.equal('test_collection_methods4', collection.collectionName);
            
                // Rename the collection and with the dropTarget boolean, and check to make sure only onen exists.
                db.renameCollection("test_collection_methods4", "test_collection_methods3", {dropTarget:true}, function(err, reply) {
                  test.equal(null, err);

                  db.dropCollection("test_collection_methods3", function(err, result) {
                    test.equal(true, result);
                    db.close();
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldAccessToCollections = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, client) {
      // Create two collections
      db.createCollection('test.spiderman', function(r) {
        db.createCollection('test.mario', function(r) {
          // Insert test documents (creates collections)
          db.collection('test.spiderman', function(err, spiderman_collection) {
            spiderman_collection.insert({foo:5}, configuration.writeConcernMax(), function(err, r) {

              db.collection('test.mario', function(err, mario_collection) {
                mario_collection.insert({bar:0}, configuration.writeConcernMax(), function(err, r) {
                  // Assert collections
                  db.collections(function(err, collections) {
                    var found_spiderman = false;
                    var found_mario = false;
                    var found_does_not_exist = false;

                    collections.forEach(function(collection) {
                      if(collection.collectionName == "test.spiderman") found_spiderman = true;
                      if(collection.collectionName == "test.mario") found_mario = true;
                      if(collection.collectionName == "does_not_exist") found_does_not_exist = true;
                    });

                    test.ok(found_spiderman);
                    test.ok(found_mario);
                    test.ok(!found_does_not_exist);
                    db.close();
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * Example of a simple document save and then resave with safe set to true
 *
 * @_class collection
 * @_function drop
 * @ignore
 */
exports.shouldCorrectlyDropCollectionWithDropFunction = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Create a collection we want to drop later
      db.createCollection('test_other_drop', function(err, collection) {
        test.equal(null, err);

        // Drop the collection
        collection.drop(function(err, reply) {

          // Ensure we don't have the collection in the set of names
          db.collectionNames(function(err, replies) {

            var found = false;
            // For each collection in the list of collection names in this db look for the
            // dropped collection
            replies.forEach(function(document) {
              if(document.name == "test_other_drop") {
                found = true;
                return;
              }
            });

            // Ensure the collection is not found
            test.equal(false, found);

            // Let's close the db
            db.close();
            test.done();
          });
        });
      });
    });
    // DOC_END
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyRetriveCollectionNames = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1}).open(function(err, db) {
      db.createCollection('test_collection_names', function(err, r) {
        test.equal(null, err);

        db.collectionNames(function(err, documents) {
          var found = false;
          var found2 = false;
    
          documents.forEach(function(document) {
            if(document.name == configuration.database + '.test_collection_names') found = true;
          });
    
          test.ok(found);
          // Insert a document in an non-existing collection should create the collection
          db.collection('test_collection_names2', function(err, collection) {
            collection.insert({a:1}, configuration.writeConcernMax(), function(err, r) {
              db.collectionNames(function(err, documents) {
                documents.forEach(function(document) {
                  if(document.name == configuration.database + '.test_collection_names2') found = true;
                  if(document.name == configuration.database + '.test_collection_names') found2 = true;
                });

                test.ok(found);
                test.ok(found2);
                
                // Let's close the db
                db.close();
                test.done();
              });
            })
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyRetrieveCollectionInfo = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Cursor = configuration.require.Cursor;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_collections_info', function(err, r) {
        db.collectionsInfo(function(err, cursor) {
          // Fetch all the collection info
          cursor.toArray(function(err, documents) {
            test.ok(documents.length > 1);

            var found = false;
            documents.forEach(function(document) {
              if(document.name == configuration.database + '.test_collections_info') found = true;
            });
            
            test.ok(found);
            // Let's close the db
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * An example returning the options for a collection.
 *
 * @_class collection
 * @_function options
 */
exports.shouldCorrectlyRetriveCollectionOptions = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Collection = configuration.require.Collection;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Create a test collection that we are getting the options back from
      db.createCollection('test_collection_options', {'capped':true, 'size':1024}, function(err, collection) {
        test.equal('test_collection_options', collection.collectionName);

        // Let's fetch the collection options
        collection.options(function(err, options) {
          test.equal(true, options.capped);
          test.ok(options.size >= 1024);

          db.close();
          test.done();
        });
      });
    });
    // DOC_END
  }
}

/**
 * An example showing how to establish if it's a capped collection
 *
 * @_class collection
 * @_function isCapped
 */
exports.shouldCorrectlyExecuteIsCapped = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Collection = configuration.require.Collection;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Create a test collection that we are getting the options back from
      db.createCollection('test_collection_is_capped', {'capped':true, 'size':1024}, function(err, collection) {
        test.equal('test_collection_is_capped', collection.collectionName);

        // Let's fetch the collection options
        collection.isCapped(function(err, capped) {
          test.equal(true, capped);

          db.close();
          test.done();
        });
      });
    });
    // DOC_END
  }
}

/**
 * An example showing the use of the indexExists function for a single index name and a list of index names.
 *
 * @_class collection
 * @_function indexExists
 */
exports.shouldCorrectlyExecuteIndexExists = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Create a test collection that we are getting the options back from
      db.createCollection('test_collection_index_exists', configuration.writeConcernMax(), function(err, collection) {
        test.equal(null, err);
        // Create an index on the collection
        collection.createIndex('a', configuration.writeConcernMax(), function(err, indexName) {
          // Let's test to check if a single index exists
          collection.indexExists("a_1", function(err, result) {
            test.equal(true, result);

            // Let's test to check if multiple indexes are available
            collection.indexExists(["a_1", "_id_"], function(err, result) {
              test.equal(true, result);

              // Check if a non existing index exists
              collection.indexExists("c_1", function(err, result) {
                test.equal(false, result);

                db.close();
                test.done();
              });
            });
          });
        });
      });
    });
    // DOC_END
  }
}

/**
 * @ignore
 */
exports.shouldEnsureStrictAccessCollection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Collection = configuration.require.Collection;
    
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('does-not-exist', {strict: true}, function(err, collection) {
        test.ok(err instanceof Error);
        test.equal("Collection does-not-exist does not exist. Currently in strict mode.", err.message);

        db.createCollection('test_strict_access_collection', function(err, collection) {
          db.collection('test_strict_access_collection', configuration.writeConcernMax(), function(err, collection) {
            test.equal(null, err);
            test.ok(collection.collectionName);
            // Let's close the db
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldPerformStrictCreateCollection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Collection = configuration.require.Collection;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_strict_create_collection', function(err, collection) {
        test.equal(null, err);
        test.equal('test_strict_create_collection', collection.collectionName);

        // Creating an existing collection should fail
        db.createCollection('test_strict_create_collection', {strict: true}, function(err, collection) {
          test.ok(err instanceof Error);
          test.equal("Collection test_strict_create_collection already exists. Currently in strict mode.", err.message);

          // Switch out of strict mode and try to re-create collection
          db.createCollection('test_strict_create_collection', {strict: false}, function(err, collection) {
            test.equal(null, err);
            test.ok(collection.collectionName);

            // Let's close the db
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldFailToInsertDueToIllegalKeys = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_invalid_key_names', function(err, collection) {
        // Legal inserts
        collection.insert([{'hello':'world'}, {'hello':{'hello':'world'}}], configuration.writeConcernMax(), function(err, r) {
          // Illegal insert for key
          collection.insert({'$hello':'world'}, configuration.writeConcernMax(), function(err, doc) {
            test.ok(err instanceof Error);
            test.equal("key $hello must not start with '$'", err.message);

            collection.insert({'hello':{'$hello':'world'}}, configuration.writeConcernMax(), function(err, doc) {
              test.ok(err instanceof Error);
              test.equal("key $hello must not start with '$'", err.message);

              collection.insert({'he$llo':'world'}, configuration.writeConcernMax(), function(err, docs) {
                test.equal(null, err);

                collection.insert({'hello':{'hell$o':'world'}}, configuration.writeConcernMax(), function(err, docs) {
                  test.ok(err == null);

                  collection.insert({'.hello':'world'}, configuration.writeConcernMax(), function(err, doc) {
                    test.ok(err instanceof Error);
                    test.equal("key .hello must not contain '.'", err.message);

                    collection.insert({'hello':{'.hello':'world'}}, configuration.writeConcernMax(), function(err, doc) {
                      test.ok(err instanceof Error);
                      test.equal("key .hello must not contain '.'", err.message);

                      collection.insert({'hello.':'world'}, configuration.writeConcernMax(), function(err, doc) {
                        test.ok(err instanceof Error);
                        test.equal("key hello. must not contain '.'", err.message);

                        collection.insert({'hello':{'hello.':'world'}}, configuration.writeConcernMax(), function(err, doc) {
                          test.ok(err instanceof Error);
                          test.equal("key hello. must not contain '.'", err.message);
                          // Let's close the db
                          db.close();
                          test.done();
                        });
                      });
                    });
                  });
                })
              })
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldFailDueToIllegalCollectionNames = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection(5, function(err, collection) {
        test.equal("collection name must be a String", err.message);
      });

      db.collection("", function(err, collection) {
        test.equal("collection names cannot be empty", err.message);
      });

      db.collection("te$t", function(err, collection) {
        test.equal("collection names must not contain '$'", err.message);
      });

      db.collection(".test", function(err, collection) {
        test.equal("collection names must not start or end with '.'", err.message);
      });

      db.collection("test.", function(err, collection) {
        test.equal("collection names must not start or end with '.'", err.message);
      });

      db.collection("test..t", function(err, collection) {
        test.equal("collection names cannot be empty", err.message);
        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyCountOnNonExistingCollection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('test_multiple_insert_2', function(err, collection) {
        collection.count(function(err, count) {
          test.equal(0, count);
          // Let's close the db
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteSave = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;
    
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_save', function(err, collection) {
        var doc = {'hello':'world'};
        collection.save(doc, configuration.writeConcernMax(), function(err, docs) {
          test.ok(docs._id != null);

          collection.count(function(err, count) {
            test.equal(1, count);
            doc = docs;

            collection.save(doc, configuration.writeConcernMax(), function(err, doc2) {

              collection.count(function(err, count) {
                test.equal(1, count);

                collection.findOne(function(err, doc3) {
                  test.equal('world', doc3.hello);

                  doc3.hello = 'mike';

                  collection.save(doc3, configuration.writeConcernMax(), function(err, doc4) {
                    collection.count(function(err, count) {
                      test.equal(1, count);

                      collection.findOne(function(err, doc5) {
                        test.equal('mike', doc5.hello);

                        // Save another document
                        collection.save({hello:'world'}, configuration.writeConcernMax(), function(err, doc) {
                          collection.count(function(err, count) {
                            test.equal(2, count);
                            // Let's close the db
                            db.close();
                            test.done();
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveDocumentWithLongValue = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Long = configuration.require.Long;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_save_long', function(err, collection) {
        collection.insert({'x':Long.fromNumber(9223372036854775807)}, configuration.writeConcernMax(), function(err, r) {
          collection.findOne(function(err, doc) {
            test.ok(Long.fromNumber(9223372036854775807).equals(doc.x));
            // Let's close the db
            db.close();
            test.done();
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldSaveObjectThatHasIdButDoesNotExistInCollection = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_save_with_object_that_has_id_but_does_not_actually_exist_in_collection', function(err, collection) {
        var a = {'_id':'1', 'hello':'world'};
        collection.save(a, configuration.writeConcernMax(), function(err, docs) {
          collection.count(function(err, count) {
            test.equal(1, count);

            collection.findOne(function(err, doc) {
              test.equal('world', doc.hello);

              doc.hello = 'mike';
              collection.save(doc, configuration.writeConcernMax(), function(err, doc) {
                collection.findOne(function(err, doc) {
                  collection.count(function(err, count) {
                    test.equal(1, count);

                    test.equal('mike', doc.hello);
                    // Let's close the db
                    db.close();
                    test.done();
                  });
                });
              });
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyUpdateWithNoDocs = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;
    
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_should_correctly_do_update_with_no_docs', function(err, collection) {
        var id = new ObjectID(null)
        var doc = {_id:id, a:1};

        collection.update({"_id":id}, doc, configuration.writeConcernMax(), function(err, numberofupdateddocs) {
          test.equal(null, err);
          test.equal(0, numberofupdateddocs);
          
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * Example of a simple document update with safe set to false on an existing document
 *
 * @_class collection
 * @_function update
 */
exports.shouldCorrectlyUpdateASimpleDocument = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance({w:0}, {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Get a collection
      db.collection('update_a_simple_document', function(err, collection) {

        // Insert a document, then update it
        collection.insert({a:1}, configuration.writeConcernMax(), function(err, doc) {

          // Update the document with an atomic operator
          collection.update({a:1}, {$set:{b:2}});

          // Wait for a second then fetch the document
          setTimeout(function() {

            // Fetch the document that we modified
            collection.findOne({a:1}, function(err, item) {
              test.equal(null, err);
              test.equal(1, item.a);
              test.equal(2, item.b);
              db.close();
              test.done();
            });
          }, 1000);
        })
      });
    });
    // DOC_END
  }
}

/**
 * Example of a simple document update using upsert (the document will be inserted if it does not exist)
 *
 * @_class collection
 * @_function update
 * @ignore
 */
exports.shouldCorrectlyUpsertASimpleDocument = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Get a collection
      db.collection('update_a_simple_document_upsert', function(err, collection) {

        // Update the document using an upsert operation, ensuring creation if it does not exist
        collection.update({a:1}, {b:2, a:1}, {upsert:true, w: 1}, function(err, result) {
          test.equal(null, err);
          test.equal(1, result);

          // Fetch the document that we modified and check if it got inserted correctly
          collection.findOne({a:1}, function(err, item) {
            test.equal(null, err);
            test.equal(1, item.a);
            test.equal(2, item.b);
            db.close();
            test.done();
          });
        });
      });
    });
    // DOC_END
  }
}

/**
 * Example of an update across multiple documents using the multi option.
 *
 * @_class collection
 * @_function update
 * @ignore
 */
exports.shouldCorrectlyUpdateMultipleDocuments = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Get a collection
      db.collection('update_a_simple_document_multi', function(err, collection) {

        // Insert a couple of documentations
        collection.insert([{a:1, b:1}, {a:1, b:2}], configuration.writeConcernMax(), function(err, result) {

          var o = configuration.writeConcernMax();
          o.multi = true
          // Update multiple documents using the multi option
          collection.update({a:1}, {$set:{b:0}}, o, function(err, numberUpdated) {
            test.equal(null, err);
            test.equal(2, numberUpdated);

            // Fetch all the documents and verify that we have changed the b value
            collection.find().toArray(function(err, items) {
              test.equal(null, err);
              test.equal(1, items[0].a);
              test.equal(0, items[0].b);
              test.equal(1, items[1].a);
              test.equal(0, items[1].b);

              db.close();
              test.done();
            });
          })
        });
      });
    });
    // DOC_END
  }
}

/**
 * Example of running the distinct command against a collection
 *
 * @_class collection
 * @_function distinct
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexes = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Crete the collection for the distinct example
      db.createCollection('simple_key_based_distinct', function(err, collection) {

        // Insert documents to perform distinct against
        collection.insert([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
          {a:2, b:{c:'a'}}, {a:3}, {a:3}], configuration.writeConcernMax(), function(err, ids) {

          // Peform a distinct query against the a field
          collection.distinct('a', function(err, docs) {
            test.deepEqual([0, 1, 2, 3], docs.sort());

            // Perform a distinct query against the sub-field b.c
            collection.distinct('b.c', function(err, docs) {
              test.deepEqual(['a', 'b', 'c'], docs.sort());

              db.close();
              test.done();
            });
          });
        })
      });
    });
    // DOC_END
  }
}

/**
 * Example of running the distinct command against a collection with a filter query
 *
 * @_class collection
 * @_function distinct
 * @ignore
 */
exports.shouldCorrectlyHandleDistinctIndexesWithSubQueryFilter = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Crete the collection for the distinct example
      db.createCollection('simple_key_based_distinct_sub_query_filter', function(err, collection) {

        // Insert documents to perform distinct against
        collection.insert([{a:0, b:{c:'a'}}, {a:1, b:{c:'b'}}, {a:1, b:{c:'c'}},
          {a:2, b:{c:'a'}}, {a:3}, {a:3}, {a:5, c:1}], configuration.writeConcernMax(), function(err, ids) {

          // Peform a distinct query with a filter against the documents
          collection.distinct('a', {c:1}, function(err, docs) {
            test.deepEqual([5], docs.sort());

            db.close();
            test.done();
          });
        })
      });
    });
    // DOC_END
  }
}

/**
 * Example of running simple count commands against a collection.
 *
 * @_class collection
 * @_function count
 * @ignore
 */
exports.shouldCorrectlyDoSimpleCountExamples = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Crete the collection for the distinct example
      db.createCollection('simple_count_example', function(err, collection) {

        // Insert documents to perform distinct against
        collection.insert([{a:1}, {a:2}, {a:3}, {a:4, b:1}], configuration.writeConcernMax(), function(err, ids) {

          // Perform a total count command
          collection.count(function(err, count) {
            test.equal(null, err);
            test.equal(4, count);

            // Peform a partial account where b=1
            collection.count({b:1}, function(err, count) {
              test.equal(null, err);
              test.equal(1, count);

              db.close();
              test.done();
            });
          });
        });
      });
    });
    // DOC_END
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyExecuteInsertUpdateDeleteSafeMode = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('test_should_execute_insert_update_delete_safe_mode', function(err, collection) {
        test.equal('test_should_execute_insert_update_delete_safe_mode', collection.collectionName);

        collection.insert({i:1}, configuration.writeConcernMax(), function(err, ids) {
          test.equal(1, ids.length);
          test.ok(ids[0]._id.toHexString().length == 24);

          // Update the record
          collection.update({i:1}, {"$set":{i:2}}, configuration.writeConcernMax(), function(err, result) {
            test.equal(null, err);
            test.equal(1, result);

            // Remove safely
            collection.remove({}, configuration.writeConcernMax(), function(err, result) {
              test.equal(null, err);

              db.close();
              test.done();
            });
          });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldPerformMultipleSaves = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection("multiple_save_test", function(err, collection) {
        var doc = {
          name: 'amit',
          text: 'some text'
        };

        //insert new user
        collection.save(doc, configuration.writeConcernMax(), function(err, r) {
          collection.find({}, {name: 1}).limit(1).toArray(function(err, users){
            var user = users[0]

            if(err) {
              throw new Error(err)
            } else if(user) {
              user.pants = 'worn'

              collection.save(user, configuration.writeConcernMax(), function(err, result){
                test.equal(null, err);
                test.equal(1, result);
                db.close();
                test.done();
              })
            }
          });
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlySaveDocumentWithNestedArray = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection("save_error_on_save_test", function(err, collection) {
        // Create unique index for username
        collection.createIndex([['username', 1]], configuration.writeConcernMax(), function(err, result) {
          var doc = {
            email: 'email@email.com',
            encrypted_password: 'password',
            friends:
              [ '4db96b973d01205364000006',
                '4db94a1948a683a176000001',
                '4dc77b24c5ba38be14000002' ],
            location: [ 72.4930088, 23.0431957 ],
            name: 'Amit Kumar',
            password_salt: 'salty',
            profile_fields: [],
            username: 'amit' };
          //insert new user
          collection.save(doc, configuration.writeConcernMax(), function(err, doc) {

              collection.find({}).limit(1).toArray(function(err, users) {
                test.equal(null, err);
                var user = users[0]
                user.friends.splice(1,1)

                collection.save(user, function(err, doc) {
                  test.equal(null, err);

                  // Update again
                  collection.update({_id:new ObjectID(user._id.toString())}, {friends:user.friends}, {upsert:true, w: 1}, function(err, result) {
                    test.equal(null, err);
                    test.equal(1, result);

                    db.close();
                    test.done();
                  });
                });
              });
          });
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldPeformCollectionRemoveWithNoCallback = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection("remove_with_no_callback_bug_test", function(err, collection) {
        collection.save({a:1}, configuration.writeConcernMax(), function(){
          collection.save({b:1}, configuration.writeConcernMax(), function(){
            collection.save({c:1}, configuration.writeConcernMax(), function(){
               collection.remove({a:1}, configuration.writeConcernMax(), function(err, r) {
                 // Let's perform a count
                 collection.count(function(err, count) {
                   test.equal(null, err);
                   test.equal(2, count);
                   db.close();
                   test.done();
                 });
               })
             });
           });
        });
      });
    });
  }
}

/**
 * Example of retrieving a collections indexes
 *
 * @_class collection
 * @_function indexes
 * @ignore
 */
exports.shouldCorrectlyRetriveACollectionsIndexes = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Crete the collection for the distinct example
      db.createCollection('simple_key_based_distinct', function(err, collection) {
        // Create a geo 2d index
        collection.ensureIndex({loc:"2d"}, configuration.writeConcernMax(), function(err, result) {
          test.equal(null, err);

          // Create a simple single field index
          collection.ensureIndex({a:1}, configuration.writeConcernMax(), function(err, result) {
            test.equal(null, err);

            setTimeout(function() {
              // List all of the indexes on the collection
              collection.indexes(function(err, indexes) {
                test.equal(3, indexes.length);

                db.close();
                test.done();
              });              
            }, 1000);
          })
        })
      });
    });
    // DOC_END
  }
}

/**
 * Example of retrieving a collections stats
 *
 * @_class collection
 * @_function stats
 * @ignore
 */
exports.shouldCorrectlyReturnACollectionsStats = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});

    // DOC_LINE var db = new Db('test', new Server('locahost', 27017));
    // DOC_START
    // Establish connection to db
    db.open(function(err, db) {

      // Crete the collection for the distinct example
      db.createCollection('collection_stats_test', function(err, collection) {

          // Insert some documents
          collection.insert([{a:1}, {hello:'world'}], configuration.writeConcernMax(), function(err, result) {

            // Retrieve the statistics for the collection
            collection.stats(function(err, stats) {
              test.equal(2, stats.count);

              db.close();
              test.done();
            });
          });
      });
    });
    // DOC_END
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyCreateTTLCollectionWithIndexUsingEnsureIndex = {
  metadata: { requires: { mongodb: ">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldCorrectlyCreateTTLCollectionWithIndexUsingEnsureIndex', function(err, collection) {
        collection.ensureIndex({createdAt:1}, {expireAfterSeconds:1, w: 1}, function(err, result) {
          test.equal(null, err);

          // Insert a document with a date
          collection.insert({a:1, createdAt:new Date()}, configuration.writeConcernMax(), function(err, result) {
            test.equal(null, err);

            collection.indexInformation({full:true}, function(err, indexes) {
              test.equal(null, err);

              for(var i = 0; i < indexes.length; i++) {
                if(indexes[i].name == "createdAt_1") {
                  test.equal(1, indexes[i].expireAfterSeconds);
                  break;
                }
              }

              db.close();
              test.done();
            });
          });
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyCreateTTLCollectionWithIndexCreateIndex = {
  metadata: { requires: { mongodb: ">2.1.0", topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldCorrectlyCreateTTLCollectionWithIndexCreateIndex', {}, function(err, collection) {
        collection.createIndex({createdAt:1}, {expireAfterSeconds:1, w: 1}, function(err, result) {
          test.equal(null, err);

          // Insert a document with a date
          collection.insert({a:1, createdAt:new Date()}, configuration.writeConcernMax(), function(err, result) {
            test.equal(null, err);

            collection.indexInformation({full:true}, function(err, indexes) {
              test.equal(null, err);

              for(var i = 0; i < indexes.length; i++) {
                if(indexes[i].name == "createdAt_1") {
                  test.equal(1, indexes[i].expireAfterSeconds);
                  break;
                }
              }

              db.close();
              test.done();
            });
          });
        })
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyReadBackDocumentWithNull = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldCorrectlyReadBackDocumentWithNull', {}, function(err, collection) {
        // Insert a document with a date
        collection.insert({test:null}, configuration.writeConcernMax(), function(err, result) {
            test.equal(null, err);

            collection.findOne(function(err, item) {
              test.equal(null, err);

              db.close();
              test.done();
            });
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldThrowErrorDueToIllegalUpdate = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.createCollection('shouldThrowErrorDueToIllegalUpdate', {}, function(err, coll) {
        try {
          coll.update({}, null, function (err, res) {});
        } catch (err) {
          test.equal("document must be a valid JavaScript object", err.message)
        }    

        try {
          coll.update(null, null, function (err, res) {});
        } catch (err) {
          test.equal("selector must be a valid JavaScript object", err.message)
        }    

        db.close();
        test.done()    
      });
    });
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyHandle0asIdForSave = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('shouldCorrectlyHandle0asIdForSave').save({_id:0}, function(err, r) {
        test.equal(null, err);

        db.collection('shouldCorrectlyHandle0asIdForSave').save({_id:0}, function(err, r) {
          test.equal(null, err);
          db.close();
          test.done();
        });
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly execute update with . field in selector'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('executeUpdateWithElemMatch').update({'item.i': 1}, {$set: {a:1}}, function(err, result, full) {
        test.equal(null, err);

        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly execute update with elemMatch field in selector'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('executeUpdateWithElemMatch').update({item: {$elemMatch: {name: 'my_name'}}}, {$set: {a:1}}, function(err, result, full) {
        test.equal(null, err);

        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly execute find with elemMatch field in selector'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('executeUpdateWithElemMatch').findOne({item: {$elemMatch: {name: 'my_name'}}}, function(err, result, full) {
        test.equal(null, err);

        db.close();
        test.done();
      });
    });
  }
}

/**
 * @ignore
 */
exports['Should correctly execute remove with elemMatch field in selector'] = {
  metadata: { requires: { topology: ['single', 'replicaset', 'sharded', 'ssl'] } },
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var ObjectID = configuration.require.ObjectID;

    var db = configuration.newDbInstance(configuration.writeConcernMax(), {poolSize:1});
    db.open(function(err, db) {
      db.collection('executeUpdateWithElemMatch').remove({item: {$elemMatch: {name: 'my_name'}}}, function(err, result, full) {
        test.equal(null, err);

        db.close();
        test.done();
      });
    });
  }
}