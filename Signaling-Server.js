// Muaz Khan      - www.MuazKhan.com
// MIT License    - www.WebRTC-Experiment.com/licence
// Documentation  - github.com/muaz-khan/RTCMultiConnection

module.exports = exports = function(app, socketCallback) {
  // stores all sockets, user-ids, extra-data and connected sockets
  // you can check presence as following:
  // var isRoomExist = listOfUsers['room-id'] != null;
  var listOfUsers = {};

  var shiftedModerationControls = {};

  // for scalable-broadcast demos
  var ScalableBroadcast;

  var io = require('socket.io');

  //Connect to Socket I/O Server
  try {
    // use latest socket.io
    io = io(app);
    io.on('connection', onConnection);
  } catch (e) {
    // otherwise fallback
    io = io.listen(app, {
      log: false,
      origins: '*:*'
    });

    io.set('transports', ['websocket', 'xhr-polling', 'jsonp-polling']);

    io.sockets.on('connection', onConnection);
  }

  // to secure your socket.io usage: (via: docs/tips-tricks.md)
  // io.set('origins', 'https://domain.com');

  //Add User to listOfUsers
  function appendUser(socket) {
    var alreadyExist = listOfUsers[socket.userid];
    var extra = {};

    //Check user is exist?
    if (alreadyExist && alreadyExist.extra) {
      extra = alreadyExist.extra;
    }

    var params = socket.handshake.query;

    if (params.extra) {
      try {
        if (typeof params.extra === 'string') {
          params.extra = JSON.parse(params.extra);
        }
        extra = params.extra;
      } catch (e) {
        extra = params.extra;
      }
    }

    listOfUsers[socket.userid] = {
      socket: socket,
      connectedWith: {},
      isPublic: false, // means: isPublicModerator
      extra: extra || {},
      maxParticipantsAllowed: params.maxParticipantsAllowed || 1000
    };
  }

  function onConnection(socket) {

    //Parameter from the socket
    var params = socket.handshake.query;
    var socketMessageEvent = params.msgEvent || 'RTCMultiConnection-Message';

    var sessionid = params.sessionid;
    var autoCloseEntireSession = params.autoCloseEntireSession;

    if (params.enableScalableBroadcast) { //OPEN SCALEABLE BROADCAST
      if (!ScalableBroadcast) {
        ScalableBroadcast = require('./Scalable-Broadcast.js'); //ASSIGN SCALABLE BROADCAST
      }
      ScalableBroadcast(socket, params.maxRelayLimitPerUser); //START USING SCALEABLE BROADCAST
    }

    // temporarily disabled
    if (!!listOfUsers[params.userid]) {
      params.dontUpdateUserId = true;

      var useridAlreadyTaken = params.userid;
      params.userid = (Math.random() * 1000).toString().replace('.', '');
      socket.emit('userid-already-taken', useridAlreadyTaken, params.userid);
    }

    socket.userid = params.userid;
    appendUser(socket);

    if (autoCloseEntireSession == 'false' && sessionid == socket.userid) {
      socket.shiftModerationControlBeforeLeaving = true;
    }

    socket.on('shift-moderator-control-on-disconnect', function() {
      socket.shiftModerationControlBeforeLeaving = true;
    });

    //updated extra-data
    socket.on('extra-data-updated', function(extra) {
      try {
        if (!listOfUsers[socket.userid])
          return;
        listOfUsers[socket.userid].extra = extra;

        for (var user in listOfUsers[socket.userid].connectedWith) {
          listOfUsers[user].socket.emit('extra-data-updated', socket.userid, extra);
        }
      } catch (e) {
        pushLogs('extra-data-updated', e);
      }
    });

    //Getting remote user extra-data
    socket.on('get-remote-user-extra-data', function(remoteUserId, callback) {
      callback = callback || function() {};
      if (!remoteUserId || !listOfUsers[remoteUserId]) {
        callback('remoteUserId (' + remoteUserId + ') does NOT exist.');
        return;
      }
      callback(listOfUsers[remoteUserId].extra);
    });

    //Setting this user is public moderator
    socket.on('become-a-public-moderator', function() {
      try {
        if (!listOfUsers[socket.userid])
          return;
        listOfUsers[socket.userid].isPublic = true;
      } catch (e) {
        pushLogs('become-a-public-moderator', e);
      }
    });

    var dontDuplicateListeners = {};
    socket.on('set-custom-socket-event-listener', function(customEvent) {
      if (dontDuplicateListeners[customEvent])
        return;
      dontDuplicateListeners[customEvent] = customEvent;

      socket.on(customEvent, function(message) {
        try {
          socket.broadcast.emit(customEvent, message);
        } catch (e) {}
      });
    });

    //Setting this user isn't public moderator
    socket.on('dont-make-me-moderator', function() {
      try {
        if (!listOfUsers[socket.userid])
          return;
        listOfUsers[socket.userid].isPublic = false;
      } catch (e) {
        pushLogs('dont-make-me-moderator', e);
      }
    });

    //Getting all public moderator
    socket.on('get-public-moderators', function(userIdStartsWith, callback) {
      try {
        userIdStartsWith = userIdStartsWith || '';
        var allPublicModerators = [];
        for (var moderatorId in listOfUsers) {
          if (listOfUsers[moderatorId].isPublic && moderatorId.indexOf(userIdStartsWith) === 0 && moderatorId !== socket.userid) {
            var moderator = listOfUsers[moderatorId];
            allPublicModerators.push({userid: moderatorId, extra: moderator.extra});
          }
        }

        callback(allPublicModerators);
      } catch (e) {
        pushLogs('get-public-moderators', e);
      }
    });

    //Change user Id
    socket.on('changed-uuid', function(newUserId, callback) {
      callback = callback || function() {};

      if (params.dontUpdateUserId) {
        delete params.dontUpdateUserId;
        return;
      }

      try {
        if (listOfUsers[socket.userid] && listOfUsers[socket.userid].socket.userid == socket.userid) {
          if (newUserId === socket.userid)
            return;

          var oldUserId = socket.userid;
          listOfUsers[newUserId] = listOfUsers[oldUserId];
          listOfUsers[newUserId].socket.userid = socket.userid = newUserId;
          delete listOfUsers[oldUserId];

          callback();
          return;
        }

        socket.userid = newUserId;
        appendUser(socket);

        callback();
      } catch (e) {
        pushLogs('changed-uuid', e);
      }
    });

    //Set password
    socket.on('set-password', function(password) {
      try {
        if (listOfUsers[socket.userid]) {
          listOfUsers[socket.userid].password = password;
        }
      } catch (e) {
        pushLogs('set-password', e);
      }
    });

    //Closing connect with specific peers
    socket.on('disconnect-with', function(remoteUserId, callback) {
      try {
        if (listOfUsers[socket.userid] && listOfUsers[socket.userid].connectedWith[remoteUserId]) {
          delete listOfUsers[socket.userid].connectedWith[remoteUserId];
          socket.emit('user-disconnected', remoteUserId);
        }

        if (!listOfUsers[remoteUserId])
          return callback();

        if (listOfUsers[remoteUserId].connectedWith[socket.userid]) {
          delete listOfUsers[remoteUserId].connectedWith[socket.userid];
          listOfUsers[remoteUserId].socket.emit('user-disconnected', socket.userid);
        }
        callback();
      } catch (e) {
        pushLogs('disconnect-with', e);
      }
    });

    ///Close entire session
    socket.on('close-entire-session', function(callback) {
      try {
        var connectedWith = listOfUsers[socket.userid].connectedWith;

        //Close all other peers that connected with this peers
        Object.keys(connectedWith).forEach(function(key) {
          if (connectedWith[key] && connectedWith[key].emit) {
            try {
              connectedWith[key].emit('closed-entire-session', socket.userid, listOfUsers[socket.userid].extra);
            } catch (e) {}
          }
        });

        delete shiftedModerationControls[socket.userid];
        callback();
      } catch (e) {
        pushLogs('close-entire-session', e);
      }
    });

    //Checking user is stil exist
    socket.on('check-presence', function(userid, callback) {
      if (!listOfUsers[userid]) {
        callback(false, userid, {});
      } else {
        callback(userid !== socket.userid, userid, listOfUsers[userid].extra);
      }
    });

    function onMessageCallback(message) {
      try {
        //Not found user in the lists
        if (!listOfUsers[message.sender]) {
          socket.emit('user-not-found', message.sender);
          return;
        }

        if (!message.message.userLeft && !listOfUsers[message.sender].connectedWith[message.remoteUserId] && //Not connect with remoteUserId
            !!listOfUsers[message.remoteUserId]) { // There isn't message remoteUserId in listOfUsers

          //Connect with remoteId
          listOfUsers[message.sender].connectedWith[message.remoteUserId] = listOfUsers[message.remoteUserId].socket;

          //Emit User-connected eventObject to Sender
          listOfUsers[message.sender].socket.emit('user-connected', message.remoteUserId);

          // Set value listOfUser[remoteUserId]
          if (!listOfUsers[message.remoteUserId]) {
            listOfUsers[message.remoteUserId] = {
              socket: null,
              connectedWith: {},
              isPublic: false,
              extra: {},
              maxParticipantsAllowed: params.maxParticipantsAllowed || 1000
            };
          }

          listOfUsers[message.remoteUserId].connectedWith[message.sender] = socket;

          if (listOfUsers[message.remoteUserId].socket) {
            //Emit User-connected eventObject to RemoteUser
            listOfUsers[message.remoteUserId].socket.emit('user-connected', message.sender);
          }
        }

        if (listOfUsers[message.sender].connectedWith[message.remoteUserId] && listOfUsers[socket.userid]) {
          message.extra = listOfUsers[socket.userid].extra;
          listOfUsers[message.sender].connectedWith[message.remoteUserId].emit(socketMessageEvent, message);
        }
      } catch (e) {
        pushLogs('onMessageCallback', e);
      }
    }

    function joinARoom(message) {

      var roomInitiator = listOfUsers[message.remoteUserId];
      //If listsOfUsers[remoteUserId] has no data, return;
      if (!roomInitiator) {
        return;
      }

      var usersInARoom = roomInitiator.connectedWith; //Users are in the room of roomInitiator
      var maxParticipantsAllowed = roomInitiator.maxParticipantsAllowed;

      //If room has exceeded users in the room return;
      if (Object.keys(usersInARoom).length >= maxParticipantsAllowed) {
        socket.emit('room-full', message.remoteUserId);

        if (roomInitiator.connectedWith[socket.userid]) {
          delete roomInitiator.connectedWith[socket.userid];
        }
        return;
      }

      var inviteTheseUsers = [roomInitiator.socket];
      Object.keys(usersInARoom).forEach(function(key) {
        inviteTheseUsers.push(usersInARoom[key]);
      });

      var keepUnique = []; //Unique users list for checking it unique
      inviteTheseUsers.forEach(function(userSocket) {
        if (userSocket.userid == socket.userid)
          return; // if the same socket.userId return
        if (keepUnique.indexOf(userSocket.userid) != -1) {
          return;
        }
        keepUnique.push(userSocket.userid);

        message.remoteUserId = userSocket.userid;
        //Send Message to userSocket
        userSocket.emit(socketMessageEvent, message);
      });
    }

    var numberOfPasswordTries = 0;
    socket.on(socketMessageEvent, function(message, callback) {
      if (message.remoteUserId && message.remoteUserId === socket.userid) {
        // remoteUserId MUST be unique
        return;
      }

      try {
        if (message.remoteUserId && message.remoteUserId != 'system' && message.message.newParticipationRequest) {
          //If you set password to join Session
          if (listOfUsers[message.remoteUserId] && listOfUsers[message.remoteUserId].password) {
            if (numberOfPasswordTries > 3) { //Too much login
              socket.emit('password-max-tries-over', message.remoteUserId);
              return;
            }

            if (!message.password) {
              numberOfPasswordTries++;
              //try to join with password
              socket.emit('join-with-password', message.remoteUserId);
              return;
            }

            if (message.password != listOfUsers[message.remoteUserId].password) {
              numberOfPasswordTries++;
              socket.emit('invalid-password', message.remoteUserId, message.password);
              return;
            }
          }
          //if you has no password to JOIN
          if (listOfUsers[message.remoteUserId]) {
            joinARoom(message);
            return;
          }
        }

        //Change Moderation Control to another
        if (message.message.shiftedModerationControl) {
          if (!message.message.firedOnLeave) {
            onMessageCallback(message);
            return;
          }
          shiftedModerationControls[message.sender] = message;
          return;
        }

        // for v3 backward compatibility; >v3.3.3 no more uses below block
        if (message.remoteUserId == 'system') {
          if (message.message.detectPresence) {
            if (message.message.userid === socket.userid) {
              callback(false, socket.userid);
              return;
            }

            callback(!!listOfUsers[message.message.userid], message.message.userid);
            return;
          }
        }

        if (!listOfUsers[message.sender]) {
          listOfUsers[message.sender] = {
            socket: socket,
            connectedWith: {},
            isPublic: false,
            extra: {},
            maxParticipantsAllowed: params.maxParticipantsAllowed || 1000
          };
        }

        // if someone tries to join a person who is absent
        if (message.message.newParticipationRequest) {
          var waitFor = 60 * 10; // wait for 10 minutes
          var invokedTimes = 0;

          (function repeater() {
            if (typeof socket == 'undefined' || !listOfUsers[socket.userid]) {
              return;
            }

            invokedTimes++;
            if (invokedTimes > waitFor) {
              //Timeout
              socket.emit('user-not-found', message.remoteUserId);
              return;
            }

            //Joining room when has a socket
            if (listOfUsers[message.remoteUserId] && listOfUsers[message.remoteUserId].socket) {
              joinARoom(message);
              return;
            }

            setTimeout(repeater, 1000);
          })();

          return;
        }

        onMessageCallback(message);
      } catch (e) {
        pushLogs('on-socketMessageEvent', e);
      }
    });
    
    socket.on('disconnect', function() {
      try {
        if (socket && socket.namespace && socket.namespace.sockets) {
          delete socket.namespace.sockets[this.id];
        }
      } catch (e) {
        pushLogs('disconnect', e);
      }

      try {
        var message = shiftedModerationControls[socket.userid];

        if (message) {
          delete shiftedModerationControls[message.userid];
          onMessageCallback(message);
        }
      } catch (e) {
        pushLogs('disconnect', e);
      }

      try {
        // inform all connected users
        if (listOfUsers[socket.userid]) {
          var firstUserSocket = null;

          for (var s in listOfUsers[socket.userid].connectedWith) {
            if (!firstUserSocket) {
              firstUserSocket = listOfUsers[socket.userid].connectedWith[s];
            }

            listOfUsers[socket.userid].connectedWith[s].emit('user-disconnected', socket.userid);

            if (listOfUsers[s] && listOfUsers[s].connectedWith[socket.userid]) {
              delete listOfUsers[s].connectedWith[socket.userid];
              listOfUsers[s].socket.emit('user-disconnected', socket.userid);
            }
          }

          if (socket.shiftModerationControlBeforeLeaving && firstUserSocket) {
            firstUserSocket.emit('become-next-modrator', sessionid);
          }
        }
      } catch (e) {
        pushLogs('disconnect', e);
      }

      delete listOfUsers[socket.userid];
    });

    if (socketCallback) {
      socketCallback(socket);
    }
  }
};

var enableLogs = true;

try {
  // var _enableLogs = require('./config.json').enableLogs;

  // if (_enableLogs) {
  //   enableLogs = true;
  // }
} catch (e) {
  enableLogs = false;
}

//Just Write log to file
var fs = require('fs');

//log
function pushLogs() {
  if (!enableLogs)
    return;

  var logsFile = process.cwd() + '/logs.json';

  var utcDateString = (new Date).toUTCString().replace(/ |-|,|:|\./g, '');

  // uncache to fetch recent (up-to-dated)
  uncache(logsFile);

  var logs = {};

  try {
    logs = require(logsFile);
  } catch (e) {}

  if (arguments[1] && arguments[1].stack) {
    arguments[1] = arguments[1].stack;
  }

  try {
    logs[utcDateString] = JSON.stringify(arguments, null, '\t');
    fs.writeFileSync(logsFile, JSON.stringify(logs, null, '\t'));
  } catch (e) {
    logs[utcDateString] = arguments.toString();
  }
}

// removing JSON from cache
function uncache(jsonFile) {
  searchCache(jsonFile, function(mod) {
    delete require.cache[mod.id];
  });

  Object.keys(module.constructor._pathCache).forEach(function(cacheKey) {
    if (cacheKey.indexOf(jsonFile) > 0) {
      delete module.constructor._pathCache[cacheKey];
    }
  });
}

function searchCache(jsonFile, callback) {
  var mod = require.resolve(jsonFile);

  if (mod && ((mod = require.cache[mod]) !== undefined)) {
    (function run(mod) {
      mod.children.forEach(function(child) {
        run(child);
      });

      callback(mod);
    })(mod);
  }
}
