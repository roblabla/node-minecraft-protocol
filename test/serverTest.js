var mc = require('../');
var Client = mc.Client;
var assert = require('power-assert');

mc.supportedVersions.forEach(function(supportedVersion){
  var mcData=require("minecraft-data")(supportedVersion);
  var version=mcData.version;

  describe("mc-server "+version.minecraftVersion, function() {
    it("starts listening and shuts down cleanly", function(done) {
      var server = mc.createServer({
        'online-mode': false,
        version: version.majorVersion
      });
      var listening = false;
      server.on('listening', function() {
        listening = true;
        server.close();
      });
      server.on('close', function() {
        assert.ok(listening);
        done();
      });
    });
    it("kicks clients that do not log in", function(done) {
      var server = mc.createServer({
        'online-mode': false,
        kickTimeout: 100,
        checkTimeoutInterval: 10,
        version: version.majorVersion
      });
      var count = 2;
      server.on('connection', function(client) {
        client.on('end', function(reason) {
          assert.strictEqual(reason, '{"text":"LoginTimeout"}');
          server.close();
        });
      });
      server.on('close', function() {
        resolve();
      });
      server.on('listening', function() {
        var client = new mc.Client(false,version.majorVersion);
        client.on('end', function() {
          resolve();
        });
        client.connect(25565, '127.0.0.1');
      });

      function resolve() {
        count -= 1;
        if(count <= 0) done();
      }
    });
    it("kicks clients that do not send keepalive packets", function(done) {
      var server = mc.createServer({
        'online-mode': false,
        kickTimeout: 100,
        checkTimeoutInterval: 10,
        version: version.majorVersion
      });
      var count = 2;
      server.on('connection', function(client) {
        client.on('end', function(reason) {
          assert.strictEqual(reason, '{"text":"KeepAliveTimeout"}');
          server.close();
        });
      });
      server.on('close', function() {
        resolve();
      });
      server.on('listening', function() {
        var client = mc.createClient({
          username: 'superpants',
          host: '127.0.0.1',
          port: 25565,
          keepAlive: false,
          version: version.majorVersion
        });
        client.on('end', function() {
          resolve();
        });
      });
      function resolve() {
        count -= 1;
        if(count <= 0) done();
      }
    });
    it("responds to ping requests", function(done) {
      var server = mc.createServer({
        'online-mode': false,
        motd: 'test1234',
        'max-players': 120,
        version: version.majorVersion
      });
      server.on('listening', function() {
        mc.ping({
          host: '127.0.0.1',
          version: version.majorVersion
        }, function(err, results) {
          if(err) return done(err);
          assert.ok(results.latency >= 0);
          assert.ok(results.latency <= 1000);
          delete results.latency;
          assert.deepEqual(results, {
            version: {
              name: version.minecraftVersion,
              protocol: version.version
            },
            players: {
              max: 120,
              online: 0,
              sample: []
            },
            description: {text: "test1234"}
          });
          server.close();
        });
      });
      server.on('close', done);
    });
    it("clients can log in and chat", function(done) {
      var server = mc.createServer({
        'online-mode': false,
        version: version.majorVersion
      });
      var username = ['player1', 'player2'];
      var index = 0;
      server.on('login', function(client) {
        assert.notEqual(client.id, null);
        assert.strictEqual(client.username, username[index++]);
        broadcast(client.username + ' joined the game.');
        client.on('end', function() {
          broadcast(client.username + ' left the game.', client);
          if(client.username === 'player2') server.close();
        });
        client.write('login', {
          entityId: client.id,
          levelType: 'default',
          gameMode: 1,
          dimension: 0,
          difficulty: 2,
          maxPlayers: server.maxPlayers,
          reducedDebugInfo: 0
        });
        client.on('chat', function(packet) {
          var message = '<' + client.username + '>' + ' ' + packet.message;
          broadcast(message);
        });
      });
      server.on('close', done);
      server.on('listening', function() {
        var player1 = mc.createClient({
          username: 'player1',
          host: '127.0.0.1',
          version: version.majorVersion
        });
        player1.on('login', function(packet) {
          assert.strictEqual(packet.gameMode, 1);
          assert.strictEqual(packet.levelType, 'default');
          assert.strictEqual(packet.dimension, 0);
          assert.strictEqual(packet.difficulty, 2);
          player1.once('chat', function(packet) {
            assert.strictEqual(packet.message, '{"text":"player2 joined the game."}');
            player1.once('chat', function(packet) {
              assert.strictEqual(packet.message, '{"text":"<player2> hi"}');
              player2.once('chat', fn);
              function fn(packet) {
                if(/<player2>/.test(packet.message)) {
                  player2.once('chat', fn);
                  return;
                }
                assert.strictEqual(packet.message, '{"text":"<player1> hello"}');
                player1.once('chat', function(packet) {
                  assert.strictEqual(packet.message, '{"text":"player2 left the game."}');
                  player1.end();
                });
                player2.end();
              }

              player1.write('chat', {message: "hello"});
            });
            player2.write('chat', {message: "hi"});
          });
          var player2 = mc.createClient({
            username: 'player2',
            host: '127.0.0.1',
            version: version.majorVersion
          });
        });
      });

      function broadcast(message, exclude) {
        var client;
        for(var clientId in server.clients) {
          if(!server.clients.hasOwnProperty(clientId)) continue;

          client = server.clients[clientId];
          if(client !== exclude) client.write('chat', {message: JSON.stringify({text: message}), position: 0});
        }
      }
    });
    it("kicks clients when invalid credentials", function(done) {
      this.timeout(10000);
      var server = mc.createServer({
        version: version.majorVersion
      });
      var count = 4;
      server.on('connection', function(client) {
        client.on('end', function(reason) {
          resolve();
          server.close();
        });
      });
      server.on('close', function() {
        resolve();
      });
      server.on('listening', function() {
        resolve();
        var client = mc.createClient({
          username: 'lalalal',
          host: "127.0.0.1",
          version: version.majorVersion
        });
        client.on('end', function() {
          resolve();
        });
      });
      function resolve() {
        count -= 1;
        if(count <= 0) done();
      }
    });
    it("gives correct reason for kicking clients when shutting down", function(done) {
      var server = mc.createServer({
        'online-mode': false,
        version: version.majorVersion
      });
      var count = 2;
      server.on('login', function(client) {
        client.on('end', function(reason) {
          assert.strictEqual(reason, '{"text":"ServerShutdown"}');
          resolve();
        });
        client.write('login', {
          entityId: client.id,
          levelType: 'default',
          gameMode: 1,
          dimension: 0,
          difficulty: 2,
          maxPlayers: server.maxPlayers,
          reducedDebugInfo: 0
        });
      });
      server.on('close', function() {
        resolve();
      });
      server.on('listening', function() {
        var client = mc.createClient({
          username: 'lalalal',
          host: '127.0.0.1',
          version: version.majorVersion
        });
        client.on('login', function() {
          server.close();
        });
      });
      function resolve() {
        count -= 1;
        if(count <= 0) done();
      }
    });
  });
})
