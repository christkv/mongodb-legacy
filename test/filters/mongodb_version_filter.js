var validVersion = require('./shared').validVersion;

var MongoDBVersionFilter = function() {
  // Get environmental variables that are known
  var mongodb_version = null;

  this.beforeStart = function(object, callback) {
    // Get the first configuration
    var configuration = object.configurations[0];
    // Get the MongoDB version
    configuration.newDbInstance({w:1}).open(function(err, db) {
      if(err) throw err;

      db.command({buildInfo:true}, function(err, result) {
        if(err) throw err;
        mongodb_version = result.versionArray.join('.');
        db.close();
        callback();
      });
    });
  }

	this.filter = function(test) {
  	if(test.metadata == null) return false;
  	if(test.metadata.requires == null) return false;
  	if(test.metadata.requires.mongodb == null) return false;
  	// Return if this is a valid method
    return !validVersion(mongodb_version, test.metadata.requires.mongodb);
	}
}

module.exports = MongoDBVersionFilter;
