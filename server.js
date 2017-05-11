var static = require('node-static');
var http = require('http');
var file = new(static.Server)();
var app = http.createServer(function (req, res) {
	file.serve(req, res);
});
port = Number(process.env.PORT || 3000);
app.listen(port);

var io = require('socket.io').listen(app);

//port = Number(process.env.PORT || 3000);
//var MAX_ROOM_USERS = 15;

//var fs = require('fs');
//var log = console.log.bind(console);
//var io = require('socket.io')(port);

var rooms = {};
var lastUserId = 0;
var lastRoomId = 0;

var MessageType = {
  // A messages you send to server, when want to join or leave etc.
  JOIN: 'join',
  DISCONNECT: 'disconnect',
  
  SERVER_MESSAGE: 'server_message',

  // You receive room info as a response for join command. It contains information about
  // the room you joined, and it's users
  ROOM: 'room',

  // A messages you receive from server when another user want to join or leave etc.
  USER_JOIN: 'user_join',
  USER_READY: 'user_ready',
  USER_LEAVE: 'user_leave',

  // WebRtc signalling info, session and ice-framework related
  SDP: 'sdp',
  ICE_CANDIDATE: 'ice_candidate',

  // Errors... shit happens
  ERROR_ROOM_IS_FULL: 'error_room_is_full',
  ERROR_USER_INITIALIZED: 'error_user_initialized'
};

function User() {
  this.userId = ++lastUserId;
}
User.prototype = {
  getId: function() {
    return this.userId;
  }
};

function Room(name) {
  this.roomName = name;
  this.users = [];
  this.sockets = {};
}
Room.prototype = {
  getName: function() {
    return this.roomName;
  },
  getUsers: function() {
    return this.users;
  },
  getUserById: function(id) {
    return this.users.find(function(user) {
      return user.getId() === id;
    });
  },
  numUsers: function() {
    return this.users.length;
  },
  isEmpty: function() {
    return this.users.length === 0;
  },
  addUser: function(user, socket) {
    this.users.push(user);
    this.sockets[user.getId()] = socket;
  },
  removeUser: function(id) {
    this.users = this.users.filter(function(user) {
      return user.getId() !== id;
    });
    delete this.sockets[id];
  },
  sendTo: function(user, message, data) {
    
    //console.log('Id: ' + user.getId() + ' mes: ' + message);
    //console.log(message + message);
       
    //try {
    
        var socket = this.sockets[user.getId()]; // Error: Cannot read property 'getId' of undefined
        socket.emit(message, data);
    
    //} catch (e) {
     //   console.log('Ошибка!');
    //}
  },
  sendToId: function(userId, message, data) {
    return this.sendTo(this.getUserById(userId), message, data);
  },
  broadcastFrom: function(fromUser, message, data) {
    this.users.forEach(function(user) {
      if (user.getId() !== fromUser.getId()) {
        this.sendTo(user, message, data);
      }
    }, this);
  }
};

// socket
function handleSocket(socket) {

  var user = null;
  var room = null;

  socket.on(MessageType.SERVER_MESSAGE, onServerMessage);
  
  socket.on(MessageType.JOIN, onJoin);
  socket.on(MessageType.SDP, onSdp);
  socket.on(MessageType.ICE_CANDIDATE, onIceCandidate);
  socket.on(MessageType.DISCONNECT, onLeave);

  function onServerMessage(message) {
    console.log('Message from peer: ' + message.candidate);
  }
  
  function onJoin(joinData) {
    // Somehow sent join request twice?
    if (user !== null || room !== null) {
      room.sendTo(user, MessageType.ERROR_USER_INITIALIZED);
      return;
    }

    // Let's get a room, or create if none still exists
    room = getOrCreateRoom(joinData.roomName);
    
    // TODO: корректная обработка максимального размера комнат, на данный момент ошибка user.getId
    /*if (room.numUsers() >= MAX_ROOM_USERS) {
      room.sendTo(user, MessageType.ERROR_ROOM_IS_FULL);
      return;
    }*/

    // Add a new user
    room.addUser(user = new User(), socket);

    // Send room info to new user
    room.sendTo(user, MessageType.ROOM, {
      userId: user.getId(),
      roomName: room.getName(),
      users: room.getUsers()
    });
    // Notify others of a new user joined
    room.broadcastFrom(user, MessageType.USER_JOIN, {
      userId: user.getId(),
      users: room.getUsers()
    });
    console.log('User %s joined room %s. Users in room: %d',
      user.getId(), room.getName(), room.numUsers());
  }

  function getOrCreateRoom(name) {
    var room;
    if (!name) {
      name =  ++lastRoomId + '_room';
    }
    if (!rooms[name]) {
      room = new Room(name);
      rooms[name] = room;
    }
    return rooms[name];
  }

  function onLeave() {
    if (room === null) {
      return;
    }
    room.removeUser(user.getId());
    console.log('User %d left room %s. Users in room: %d',
      user.getId(), room.getName(), room.numUsers());
    if (room.isEmpty()) {
      console.log('Room is empty - dropping room %s', room.getName());
      delete rooms[room.getName()];
    }
    room.broadcastFrom(user, MessageType.USER_LEAVE, {
      userId: user.getId()
    });
  }

  function onSdp(message) {
    try {
        console.log('type = ' + message.sdp.type);
        room.sendToId(message.userId, MessageType.SDP, {
          userId: user.getId(),
          sdp: message.sdp
        });
    } catch(e) {
        console.log('Ошибка: onSdp()');
    }
  }

  function onIceCandidate(message) {
    try {
        room.sendToId(message.userId, MessageType.ICE_CANDIDATE, {
          userId: user.getId(),
          candidate: message.candidate
        });
    } catch(e) {
        console.log('Ошибка: onIceCandidate()');
    }
  }
}

io.on('connection', handleSocket);
/*io.on('error', function() {
    console.log("Error occurred!");
});*/
console.log('Running room server on port %d', port);

/*var stdin = process.openStdin();

stdin.addListener("data", function(d) {
    console.log("you entered: [" + d.toString().trim() + "]");
  });*/
