import express from "express";
// import WebSocket from "ws";
import SocketIO from "socket.io";
import http from "http";
import crypto from "crypto";


const PORT = process.env.PORT || 4000;
const mysql = require('mysql');  // mysql 모듈 로드
const conn = {  // mysql 접속 설정
    host: '127.0.0.1',
    port: '3306',
    user: 'root',
    password: 'root',//비번 입력
    database: 'gosu'
};

var connection = mysql.createConnection(conn); // DB 커넥션 생성
connection.connect();

const app = express();
const fs = require("fs");
let roomName = null;
let nickname = "";


app.set("view engine", "pug");
app.set("views", process.cwd() + "/src/views");
app.use(express.json());
app.use(express.urlencoded({extended: false}));

app.use("/public", express.static(process.cwd() + "/src/public"));

app.get("/favicon.ico", (req, res) => res.status(204).end());

app.get("/:code", (req, res) => {
  if(req.params){
    var sql = 'SELECT BeforeCode FROM roomcode WHERE AfterCode = ?';
    var param = [req.params.code];
    connection.query(sql,param,function(err,result) {
       if (err){
          console.log(err);
         }
        if(result == ""){
          console.log("방없음");
          res.redirect("/");
        }
        else{
          roomName = result[0].BeforeCode;
          console.log("방 접속 성공");
        }
    });
    res.sendFile(__dirname + "/views/popup.html");// 닉넴 입력 창 출력
  }
  else 
    res.redirect("/");
});
//닉네임 post
app.post("/nickpost",(req,res)=>{
  console.log(req.body.Nick);
  nickname = req.body.Nick;
  res.redirect("/");
})

app.get("/", (req, res) => {
  res.render("home");
});

const httpServer = http.createServer(app);
const wsServer = SocketIO(httpServer);


let roomObjArr = [
  // {
  //   roomName,
  //   currentNum,
  //   users: [
  //     {
  //       socketId,
  //       nickname,
  //     },
  //   ],
  // },
];
const MAXIMUM = 5;

wsServer.on("connection", (socket) => {
  let myRoomName = null;
  let myNickname = null;
  //url로 들어왔을때만 호출
  if(roomName!==null){
    console.log(roomName);
    console.log(nickname);
    socket.emit("test", roomName, nickname);
    roomName = null;
  }
  socket.on("join_room1",(roomName,nickname)=>{
    let sql = 'SELECT BeforeCode FROM roomcode WHERE BeforeCode = ?';
    let param = [roomName];
    connection.query(sql,param,function(err,result){
      if(err){console.log(err);}
      if(result == ""){
        socket.emit("join_room1",roomName,nickname);
      }
      else{console.log("방 이름 중복");}
    })
  })

  socket.on("join_room", (roomName, nickname) => {
    myRoomName = roomName;
    myNickname = nickname;
    const createHashedPassword = (password) => {
      return crypto.createHash("sha512").update(password).digest("base64");
    };
    let roomCode = createHashedPassword(roomName).slice(0,8);
    if(roomName !== ""){
      var sql = 'INSERT INTO roomcode (BeforeCode,AfterCode,NickName) VALUES(?,?,?)';
      var param = [roomName,roomCode,nickname];
      connection.query(sql,param,function(err,rows,fields){
      if (err){
        console.log(err);
     }
  })
}
    let isRoomExist = false;
    let targetRoomObj = null;
    // forEach를 사용하지 않는 이유: callback함수를 사용하기 때문에 return이 효용없음.
    for (let i = 0; i < roomObjArr.length; ++i) {
      if (roomObjArr[i].roomName === roomName) {
        // Reject join the room
        if (roomObjArr[i].currentNum >= MAXIMUM) {
          socket.emit("reject_join");
          return;
        }

        isRoomExist = true;
        targetRoomObj = roomObjArr[i];
        break;
      }
    }

    // Create room
    if (!isRoomExist) {
      targetRoomObj = {
        roomName,
        currentNum: 0,
        users: [],
      };
      roomObjArr.push(targetRoomObj);
    }

    //Join the room
    targetRoomObj.users.push({
      socketId: socket.id,
      nickname,
    });
    ++targetRoomObj.currentNum;

    socket.join(roomName);
    console.log(wsServer.sockets.adapter.rooms.get(roomName));
    socket.emit("accept_join", targetRoomObj.users,roomCode);
  });

  socket.on("offer", (offer, remoteSocketId, localNickname) => {
    socket.to(remoteSocketId).emit("offer", offer, socket.id, localNickname);
  });

  socket.on("answer", (answer, remoteSocketId) => {
    socket.to(remoteSocketId).emit("answer", answer, socket.id);
  });

  socket.on("ice", (ice, remoteSocketId) => {
    socket.to(remoteSocketId).emit("ice", ice, socket.id);
  });
  

  
  socket.on("chat1", (message, roomName) => {
    console.log(message)
    console.log(roomName);
    socket.to(roomName).emit("chat1", message);
  });

  socket.on("chat", (message, roomName) => {
    console.log(message)
    console.log(roomName);
    socket.to(roomName).emit("chat", message);
  });

  socket.on("disconnecting", () => {
    socket.to(myRoomName).emit("leave_room", socket.id, myNickname);

    let isRoomEmpty = false;
    for (let i = 0; i < roomObjArr.length; ++i) {
      if (roomObjArr[i].roomName === myRoomName) {
        const newUsers = roomObjArr[i].users.filter(
          (user) => user.socketId != socket.id
        );
        roomObjArr[i].users = newUsers;
        --roomObjArr[i].currentNum;

        if (roomObjArr[i].currentNum == 0) {
          isRoomEmpty = true;
        }
      }
    }

    // Delete room
    if (isRoomEmpty) {
      const newRoomObjArr = roomObjArr.filter(
        (roomObj) => roomObj.currentNum != 0
      );
      roomObjArr = newRoomObjArr;
    }
  });
});

const handleListen = () =>
  console.log(`✅ Listening on http://localhost:${PORT}`);
httpServer.listen(PORT, handleListen);
