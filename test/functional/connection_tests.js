/**
 * @ignore
 */
exports['Should correctly connect to server using domain socket'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstanceWithDomainSocket({w:1}, {poolSize: 1, host: "/tmp/mongodb-27017.sock"});
    db.open(function(err, db) {
      test.equal(null, err);

      db.collection("domainSocketCollection").insert({a:1}, {w:1}, function(err, item) {
        test.equal(null, err);

        db.collection("domainSocketCollection").find({a:1}).toArray(function(err, items) {
          test.equal(null, err);
          test.equal(1, items.length);

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
exports['Should connect to server using domain socket with undefined port'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db = configuration.newDbInstanceWithDomainSocket({w:1}, {poolSize: 1, host: "/tmp/mongodb-27017.sock", port:undefined});
    db.open(function(err, db) {
      test.equal(null, err);

      db.collection("domainSocketCollection").insert({x:1}, {w:1}, function(err, item) {
        test.equal(null, err);

        db.collection("domainSocketCollection").find({x:1}).toArray(function(err, items) {
          test.equal(null, err);
          test.equal(1, items.length);

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
exports['Should fail to connect using non-domain socket with undefined port'] = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var Server = configuration.require.Server
      , Db = configuration.require.Db;
    
    var error;
    try {    
      var db = new Db('test', new Server("localhost", undefined), {w:0});
      db.open(function(){ });
    } catch (err){
      error = err;
    }

    test.ok(error instanceof Error);
    test.ok(/port must be specified/.test(error));
    test.done();
  }
}

/**
 * @ignore
 */
function connectionTester(test, testName, callback) {
  return function(err, db) {
    test.equal(err, null);
    db.collection(testName, function(err, collection) {
      test.equal(err, null);
      var doc = {foo:123};
      collection.insert({foo:123}, {w:1}, function(err, docs) {
        test.equal(err, null);
        db.dropDatabase(function(err, done) {
          db.close();
          test.equal(err, null);
          test.ok(done);
          if(callback) return callback(db);
          test.done();
        });
      });
    });
  };
};

/**
 * @ignore
 */
exports.testConnectNoOptions = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;

    connect(configuration.url(), connectionTester(test, 'testConnectNoOptions', function(db) {
      test.done();
    }));
  }
}

/**
 * @ignore
 */
exports.testConnectDbOptions = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;
    connect(configuration.url(),
            { db: {native_parser: true} },
            connectionTester(test, 'testConnectDbOptions', function(db) {            
      test.equal(true, db.native_parser);
      test.done();
    }));
  }
}

/**
 * @ignore
 */
exports.testConnectServerOptions = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;

    connect(configuration.url(),
            { server: {auto_reconnect: true, poolSize: 4} },
            connectionTester(test, 'testConnectServerOptions', function(db) {            
      test.equal(4, db.serverConfig.poolSize);
      test.equal(true, db.serverConfig.autoReconnect);
      test.done();
    }));
  }
}

/**
 * @ignore
 */
exports.testConnectAllOptions = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;

    connect(configuration.url(),
            { server: {auto_reconnect: true, poolSize: 4},
              db: {native_parser: (process.env['TEST_NATIVE'] != null)} },
            connectionTester(test, 'testConnectAllOptions', function(db) {
      test.equal(4, db.serverConfig.poolSize);
      test.equal(true, db.serverConfig.autoReconnect);
      test.done();
    }));
  }
}

/**
 * @ignore
 */
exports.testConnectGoodAuth = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;
    var user = 'testConnectGoodAuth', password = 'password';
    // First add a user.
    connect(configuration.url(), function(err, db) {
      test.equal(err, null);
      
      db.addUser(user, password, function(err, result) {
        test.equal(err, null);
        db.close();
        restOfTest();
      });
    });

    function restOfTest() {
      connect(configuration.url(user, password), connectionTester(test, 'testConnectGoodAuth', function(db) {            
        test.done();
      }));
    }
  }
}

/**
 * @ignore
 */
exports.testConnectBadAuth = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;

    connect(configuration.url('slithy', 'toves'), function(err, db) { 
      test.ok(err);
      test.equal(null, db);
      test.done();
    });
  }
}

/**
 * @ignore
 */
exports.testConnectThrowsNoCallbackProvided = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var connect = configuration.require;

    test.throws(function() {
      var db = connect(configuration.url());
    });
    test.done();
  }
}

/**
 * @ignore
 */
exports.testConnectBadUrl = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    test.throws(function() {
      connect('mangodb://localhost:27017/test?safe=false', function(err, db) {
        test.ok(false, 'Bad URL!');
      });
    });
    test.done();
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyReturnTheRightDbObjectOnOpenEmit = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db_conn = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    var db2 = db_conn.db("test2");

    db2.on('open', function (err, db) {
      test.equal(db2.databaseName, db.databaseName);
    });                                                                             

    db_conn.on('open', function (err, db) {                                                
      test.equal(db_conn.databaseName, db.databaseName);
    });                                                                                                          

    db_conn.open(function (err) {                                                   
      if(err) throw err;                                                           
      var col1 = db_conn.collection('test');                                        
      var col2 = db2.collection('test');                                            

      var testData = { value : "something" };                                       
      col1.insert(testData, function (err) {                                        
        if (err) throw err;                                                         
        col2.insert(testData, function (err) {                                      
          if (err) throw err;                                                       
          db2.close();                                                              
          test.done();                                                     
        });                                                                         
      });                                                                           
    });  
  }
}

/**
 * @ignore
 */
exports.shouldCorrectlyReturnFalseOnIsConnectBeforeConnectionHappened = {
  metadata: {},
  
  // The actual test we wish to run
  test: function(configuration, test) {
    var db_conn = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:false});
    test.equal(false, db_conn.serverConfig.isConnected());
    test.done();
  }
}

// /**
//  * @ignore
//  */
// exports['Should Force reconnect event by force closing connection'] = {
//   metadata: {
//     requires: {
//       topology: 'single'
//     }
//   },
  
//   // The actual test we wish to run
//   test: function(configuration, test) {
//     var db = configuration.newDbInstance({w:1}, {poolSize:1, auto_reconnect:true});
//     db.open(function(err, db) {
//       test.equal(null, err);

//       var reconnectCalled = false;
//       // Add listener to the serverConfig
//       db.serverConfig.on('reconnect', function(err) {
//         reconnectCalled = true;
//       });

//       configuration.restart(function() {
//         db.collection('forceReconnectEvent').insert({a:1}, function(err, result) {
//           test.ok(reconnectCalled);
//           db.close();
//           test.done();
//         });
//       });
//     });  
//   }
// }