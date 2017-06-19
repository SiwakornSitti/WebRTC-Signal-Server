// Muaz Khan      - www.MuazKhan.com
// MIT License    - www.WebRTC-Experiment.com/licence
// Documentation  - github.com/muaz-khan/RTCMultiConnection

function resolveURL(url) {
  var isWin = !!process.platform.match(/^win/);
  if (!isWin) return url;
  return url.replace(/\//g, '\\');
}

// Please use HTTPs on non-localhost domains.
var isUseHTTPs = false;

// var port = 443;
var port = 9001 || process.env.PORT || 9001;

var fs = require('fs');
var path = require('path');

// see how to use a valid certificate:
// https://github.com/muaz-khan/WebRTC-Experiment/issues/62
var options = {
  key: fs.readFileSync(path.join(__dirname, resolveURL('fake-keys/privatekey.pem'))),
  cert: fs.readFileSync(path.join(__dirname, resolveURL('fake-keys/certificate.pem')))
};

// force auto reboot on failures
var autoRebootServerOnFailure = false;

// You don't need to change anything below
var server = require(isUseHTTPs ? 'https' : 'http');
var url = require('url');

function serverHandler(request, response) {
  try {
    var uri = url.parse(request.url).pathname,
      filename = path.join(process.cwd(), uri);

    //Check file exist?
    if (filename && filename.search(/server.js|Scalable-Broadcast.js|Signaling-Server.js/g) !== -1) {
      response.writeHead(404, {
        'Content-Type': 'text/plain'
      });
      response.write('404 Not Found: ' + path.join('/', uri) + '\n');
      response.end();
      return;
    }
    response.write('Server is running');
    response.end();

  } catch (e) {
    response.writeHead(404, {
      'Content-Type': 'text/plain'
    });
    response.write('<h1>Unexpected error:</h1><br><br>' + e.stack || e.message || JSON.stringify(e));
    response.end();
  }
}

var app;

if (isUseHTTPs) {
  app = server.createServer(options, serverHandler); //Https
} else {
  app = server.createServer(serverHandler); //Http
}

function cmd_exec(cmd, args, cb_stdout, cb_end) {
  var spawn = require('child_process').spawn,
    child = spawn(cmd, args),
    me = this;
  me.exit = 0;
  me.stdout = "";
  child.stdout.on('data', function (data) {
    cb_stdout(me, data)
  });
  child.stdout.on('end', function () {
    cb_end(me)
  });
}

//##
function log_console() {
  console.log(foo.stdout);

  try {
    var pidToBeKilled = foo.stdout.split('\nnode    ')[1].split(' ')[0];
    console.log('------------------------------');
    console.log('Please execute below command:');
    console.log('\x1b[31m%s\x1b[0m ', 'kill ' + pidToBeKilled);
    console.log('Then try to run "server.js" again.');
    console.log('------------------------------');

  } catch (e) {}
}

//##
function runServer() {

  //##
  app.on('error', function (e) {
    if (e.code == 'EADDRINUSE') {
      if (e.address === '0.0.0.0') {
        e.address = 'localhost';
      }

      var socketURL = (isUseHTTPs ? 'https' : 'http') + '://' + e.address + ':' + e.port + '/';

      console.log('------------------------------');
      console.log('\x1b[31m%s\x1b[0m ', 'Unable to listen on port: ' + e.port);
      console.log('\x1b[31m%s\x1b[0m ', socketURL + ' is already in use. Please kill below processes using "kill PID".');
      console.log('------------------------------');

      foo = new cmd_exec('lsof', ['-n', '-i4TCP:9001'],
        function (me, data) {
          me.stdout += data.toString();
        },
        function (me) {
          me.exit = 1;
        }
      );

      setTimeout(log_console, 250);
    }
  });

  //##
  app = app.listen(port, process.env.IP || '0.0.0.0', function (error) {
    var addr = app.address();

    if (addr.address === '0.0.0.0') {
      addr.address = 'localhost';
    }

    var domainURL = (isUseHTTPs ? 'https' : 'http') + '://' + addr.address + ':' + addr.port + '/';

    console.log('------------------------------');

    console.log('socket.io is listening at:');
    console.log('\x1b[31m%s\x1b[0m ', '\t' + domainURL);

    console.log('\n');

    console.log('Your web-browser (HTML file) MUST set this line:');
    console.log('\x1b[31m%s\x1b[0m ', 'connection.socketURL = "' + domainURL + '";');

    if (addr.address != 'localhost' && !isUseHTTPs) {
      console.log('Warning:');
      console.log('\x1b[31m%s\x1b[0m ', 'Please set isUseHTTPs=true to make sure audio,video and screen demos can work on Google Chrome as well.');
    }

    console.log('------------------------------');
    console.log('Need help? http://bit.ly/2ff7QGk');
  });


  require('./Signaling-Server.js')(app, function (socket) {
    try {
      var params = socket.handshake.query;

      if (!params.socketCustomEvent) {
        params.socketCustomEvent = 'custom-message';
      }

      socket.on(params.socketCustomEvent, function (message) {
        try {
          socket.broadcast.emit(params.socketCustomEvent, message);
        } catch (e) {}
      });
    } catch (e) {}
  });
}

if (autoRebootServerOnFailure) {
  // auto restart app on failure
  var cluster = require('cluster');
  if (cluster.isMaster) {
    cluster.fork();

    cluster.on('exit', function (worker, code, signal) {
      cluster.fork();
    });
  }

  if (cluster.isWorker) {
    runServer();
  }
} else {
  runServer();
}
