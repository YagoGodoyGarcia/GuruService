const uuid = require("uuid");
const { userJoin, getCurrentUser, clearUser, getCurrentUserWithSocket } = require("../utils/users");

const groomingMode = {
  0: [
    {
      id: 1,
      name: "storyPoint",
      displayName: "Story Point",
      points: ["0.3", "1", "2", "3", "4", "5", "6", "7", "?", "break"],
      text: "Story point of task",
    },
  ],
  1: [
    {
      id: 1,
      name: "developmentEase",
      displayName: "Development Ease",
      weight: 20,
      points: ["1", "2", "3", "4", "5", "?"],
      text: "Complexity and time taken by the developer when preparing a product at the time of development. 1 - very complex, 5 - not that complex",
    },
    {
      id: 2,
      name: "customerEffect",
      displayName: "Customer Effect",
      weight: 10,
      points: ["1", "2", "3", "4", "5", "?"],
      text: "Impact on the customer 1 - very bad, 5 - very good",
    },
    {
      id: 3,
      name: "performance",
      displayName: "Performance",
      weight: 30,
      points: ["1", "2", "3", "4", "5", "?"],
      text: "Contribution to performance 1 - very bad, 5 - very good",
    },
    {
      id: 4,
      name: "security",
      displayName: "Security",
      weight: 10,
      points: ["1", "2", "3", "4", "5", "?"],
      text: "Impact on web security 1 - very bad, 5 - very good",
    },
    {
      id: 5,
      name: "maintenance",
      displayName: "Maintenance",
      weight: 25,
      points: ["1", "2", "3", "4", "5", "?"],
      text: "How developer-friendly the post-development process is (after the product is released) 1 - very bad, 5 - very good",
    },
    {
      id: 6,
      name: "storyPoint",
      displayName: "Story Point",
      weight: 0,
      points: ["1", "2", "3", "5", "8", "13", "21", "?"],
      text: "Story point of task",
    },
  ],
};

let rooms = [];
const groomings = {};

const handleErrors = (errorFunctionName, roomID, socket, isRoomExpired) => {
  if(!socket){
    console.log("Socket not found on handle join.", errorFunctionName, roomID, rooms);
    return null;
  }
  if ((rooms && !rooms.some(room => room.roomID === roomID)) || isRoomExpired) {
    console.log("Room is expired or deleted, info shown to the user.", errorFunctionName, roomID);
    socket.emit("encounteredError", {
      id: 1,
      message:
        "Room is expired, if you think this is an error, please contact Armağan Dalkıran.",
    });
    return {
      isSuccess: false,
      message: "Room is expired, if you think this is an error, please contact Armağan Dalkıran."
    };
  }

  console.log("Something unexpected happen!");

  return {
    id: 3,
    isSuccess: false,
    message: "Your connection is lost. Connect again"
  }
};

const generateNewRoom = (nickName, groomingType) => {
  console.log("generateNewRoom")
  const currentTime = new Date().getTime();
  const expireTime = currentTime + 12 * 60 * 60 * 1000; // 12 hours
  const roomID = uuid.v4();

  const user = userJoin(nickName, roomID);

  console.log(user)
  const newRoom = {
    roomID,
    createdAt: currentTime,
    expiredAt: expireTime,
  };

  user.isAdmin = true;
  user.connected = true;

  const { credentials, ...userWithoutCredentials } = user;

  groomings[roomID] = {
    mode: groomingType,
    participants: { [user.userID]: userWithoutCredentials },
    metrics: groomingMode[groomingType],
    score: 0,
    status: "ongoing",
    isResultShown: false,
    issues: [],
    timer: {
      timeLeft: 0,
      isRunning: false
    }
  };

  rooms.push(newRoom);

  return {
    ...newRoom,
    userID: user.userID,
    credentials: user.credentials,
    isAdmin: user.isAdmin,
  };
};

const handleJoinRoom = (nickName, roomID) => {
  const user = userJoin(nickName, roomID);
  if (!user) {
    return handleErrors("handleJoinRoom", roomID);
  }

  user.connected = true;

  const { credentials, ...userWithoutCredentials } = user;

  if(!groomings[roomID]){
    return handleErrors("handleJoinRoom", roomID);
  }
  if(!groomings[roomID]?.participants){
    return handleErrors("handleJoinRoom", roomID);
  }
  groomings[roomID].participants[user.userID] = userWithoutCredentials;

  const room = rooms.find((room) => room.roomID === roomID);

  return {
    ...room,
    userID: user.userID,
    credentials: user.credentials,
    isAdmin: user.isAdmin,
  };
};

const leaveUserFromGrooming = (socketID) => {
  const user = getCurrentUserWithSocket(socketID);
  if (!user) {
    return;
  }

  if (!groomings[user.roomID]) {
    return;
  }
  const userLobbyData = groomings[user.roomID].participants[user.userID];

  if (!user.sockets.length) {
    groomings[user.roomID].participants[user.userID] = {
      ...userLobbyData,
      connected: false,
    };
  }
  return user.roomID;
};

const removeUserFromOngoingGrooming = (roomID, userID) => {
  if (!groomings[roomID]) {
    return;
  }

  delete groomings[roomID].participants[userID];
};

const checkIsRoomExpired = (roomID) => {
  const currentTime = new Date().getTime();
  const expiredRoomIDs = rooms.filter(room => room.expiredAt < currentTime).map(room => room.roomID);
  return expiredRoomIDs.includes(roomID);
}

const updateParticipantsVote = (data, credentials, roomID, socket) => {
  const user = getCurrentUser(credentials, socket);
  const isRoomExpired = checkIsRoomExpired(roomID);
  if (!user || isRoomExpired) {
    return handleErrors("updateParticipantsVote", roomID, socket, isRoomExpired);
  }

  const userLobbyData = groomings[user.roomID].participants[user.userID];

  groomings[user.roomID].participants[user.userID] = {
    ...userLobbyData,
    votes: data,
  };

  groomings[user.roomID].score = calculateScore(
    groomings[user.roomID].mode,
    groomings[user.roomID].participants,
    user.roomID
  );

  return groomings[user.roomID];
};

const getGrooming = (roomID) => {
  return groomings[roomID];
};

const calculateScore = (mode, participants, roomID) => {
  if (mode === "0") {
    let totalVoter = 0;
    let totalStoryPoint = 0;
    Object.keys(participants).forEach((participantKey) => {
      if (
        participants[participantKey].votes &&
        Object.keys(participants[participantKey].votes).length
      ) {
        const storyPoint = Number(participants[participantKey].votes.storyPoint);
        if (storyPoint) {
          totalVoter++;
          totalStoryPoint += storyPoint;
        }
      }
    });

    return findClosestFibonacci(totalStoryPoint / totalVoter).toFixed(2);
  }

  if (mode === "1") {
    let metricAverages = {};

    groomings[roomID].metrics.forEach((metric) => {
      metricAverages[metric.name] = {
        total: 0,
        average: 0,
        missingVotes: 0,
      };
    });

    Object.keys(metricAverages).forEach((metricName) => {
      Object.keys(participants).forEach((participantKey) => {
        if (!participants[participantKey].votes) {
          metricAverages[metricName].missingVotes++;
        }
        if (
          (participants[participantKey].votes && !participants[participantKey].votes[metricName]) ||
          !participants[participantKey].connected
        ) {
          metricAverages[metricName].missingVotes++;
        }

        if (
          (participants[participantKey].votes && participants[participantKey].votes[metricName]) ===
          "?"
        ) {
          metricAverages[metricName].missingVotes++;
        }

        if (
          participants[participantKey].votes &&
          Number(participants[participantKey].votes[metricName]) &&
          participants[participantKey].connected
        ) {
          metricAverages[metricName].total += Number(
            participants[participantKey].votes[metricName]
          );
        }
      });
    });

    let averageTotal = 0;

    for (const metricKey in metricAverages) {
      const metric = metricAverages[metricKey];
      const total = metric.total;
      const missingVotes = metric.missingVotes;
      const participantCount = Object.keys(participants).length;

      if (metricKey === "storyPoint") {
        metric.average =
          participantCount - missingVotes === 0
            ? 0
            : findClosestFibonacci(total / (participantCount - missingVotes));
        continue;
      }

      metric.average =
        participantCount - missingVotes === 0
          ? 0
          : (total / (participantCount - missingVotes)).toFixed(2);
    }

    const scoreMetricLength = Object.keys(metricAverages).filter(
      (key) => key !== "storyPoint"
    ).length;

    Object.keys(metricAverages).forEach((metricAveragesKey) => {
      if (metricAveragesKey !== "storyPoint") {
        averageTotal += Number(metricAverages[metricAveragesKey].average);
      }
    });

    groomings[roomID].metricAverages = metricAverages;

    const score = (averageTotal / scoreMetricLength) * 25 - 25;
    return score.toFixed(2);
  }
};

const getResults = (credentials, roomID, socket) => {
  const user = getCurrentUser(credentials, socket);
  const isRoomExpired = checkIsRoomExpired(roomID);
  if (!user || isRoomExpired) {
    return handleErrors("getResults", roomID, socket, isRoomExpired);
  }

  groomings[user.roomID].isResultShown = true;

  return groomings[user.roomID];
};


const setIssues = (data, credentials, roomID, socket) => {
  const user = getCurrentUser(credentials, socket);
  const isRoomExpired = checkIsRoomExpired(roomID);
  if (!user || isRoomExpired) {
    return handleErrors("setIssues", roomID, socket, isRoomExpired);
  }

  groomings[user.roomID].issues = data;
  return groomings[user.roomID];
};

const setGurubuAI = (data, credentials, roomID, socket) => {
  const user = getCurrentUser(credentials, socket);
  const isRoomExpired = checkIsRoomExpired(roomID);
  if (!user || isRoomExpired) {
    return handleErrors("setGurubuAI", roomID, socket, isRoomExpired);
  }

  groomings[user.roomID].gurubuAI = data;
  return groomings[user.roomID];
};

const updateTimer = (data, credentials, roomID, socket) => {
  const user = getCurrentUser(credentials, socket);
  const isRoomExpired = checkIsRoomExpired(roomID);
  if (!user || isRoomExpired) {
    return handleErrors("updateTimer", roomID, socket, isRoomExpired);
  }

  groomings[user.roomID].timer = data;

  return groomings[user.roomID];
};

const updateAvatar = (data, credentials, roomID, socket) => {
  const user = getCurrentUser(credentials, socket);
  const isRoomExpired = checkIsRoomExpired(roomID);
  if (!user || isRoomExpired) {
    return handleErrors("updateAvatar", roomID, socket, isRoomExpired);
  }
  if (!groomings[user.roomID]) {
    return;
  }

  const userLobbyData = groomings[user.roomID].participants[user.userID];
  groomings[user.roomID].participants[user.userID] = {
    ...userLobbyData,
    avatar: data,
  };

  return groomings[user.roomID];
};

const updateProfilePicture = (data, credentials, roomID, socket) => {
  const user = getCurrentUser(credentials, socket);
  const isRoomExpired = checkIsRoomExpired(roomID);
  if (!user || isRoomExpired) {
    return handleErrors("updateProfilePicture", roomID, socket, isRoomExpired);
  }
  if (!groomings[user.roomID]) {
    return;
  }

  const userLobbyData = groomings[user.roomID].participants[user.userID];
  groomings[user.roomID].participants[user.userID] = {
    ...userLobbyData,
    profile: data,
  };

  return groomings[user.roomID];
};

const resetVotes = (credentials, roomID, socket) => {
  const user = getCurrentUser(credentials, socket);
  const isRoomExpired = checkIsRoomExpired(roomID);
  if (!user || isRoomExpired) {
    return handleErrors("resetVotes", roomID, socket, isRoomExpired);
  }

  groomings[user.roomID].isResultShown = false;
  groomings[user.roomID].score = 0;
  delete groomings[user.roomID].metricAverages;

  Object.keys(groomings[user.roomID].participants).forEach((participantKey) => {
    if (groomings[user.roomID].participants[participantKey].votes) {
      groomings[user.roomID].participants[participantKey].votes = {};
    }
  });

  return groomings[user.roomID];
};

const getRooms = () => {
  return rooms;
};

const logRooms = () => {
  setInterval(() => {
    console.log(rooms);
  }, 10000);
}

const checkRoomExistance = (roomId) => {
  const isRoomExpired = checkIsRoomExpired(roomId);
  if (isRoomExpired) {
    return false;
  }
  return rooms.some((room) => room.roomID === roomId);
};

function findClosestFibonacci(number) {
  if(isNaN(number)){
    return 0;
  }

  if (number <= 0) {
    return 0;
  }

  if (number < 0.75){
    return 0.5;
  }

  let prevFibonacci = 0;
  let currentFibonacci = 1;

  while (currentFibonacci <= number) {
    const nextFibonacci = prevFibonacci + currentFibonacci;
    prevFibonacci = currentFibonacci;
    currentFibonacci = nextFibonacci;
  }

  if (Math.abs(number - prevFibonacci) < Math.abs(number - currentFibonacci)) {
    return prevFibonacci;
  } else {
    return currentFibonacci;
  }
}

const cleanRoomsAndUsers = () => {
  setInterval(() => {
    const currentTime = Date.now();

    // Get expired room IDs before modifying arrays
    const expiredRoomIDs = rooms.filter(room => room.expiredAt < currentTime).map(room => room.roomID);

    // Remove expired rooms safely
    rooms = rooms.filter(room => room.expiredAt >= currentTime);

    // Remove expired rooms from `groomings`
    expiredRoomIDs.forEach(roomID => delete groomings[roomID]);

    // Remove users in expired rooms
    expiredRoomIDs.forEach(clearUser);
    console.log("Rooms and users cleaned!");
  }, 1000 * 60 * 60 * 12); // work every 12 hours
};

const updateNickName = (credentials, newNickName, roomID, socket) => {
  const user = getCurrentUser(credentials, socket);
  const isRoomExpired = checkIsRoomExpired(roomID);
  if (!user || isRoomExpired) {
    return handleErrors("updateNickName", roomID, socket, isRoomExpired);
  }

  user.nickname = newNickName;
  for (const [key, value] of Object.entries(groomings[user.roomID].participants)) {
    if (Number(key) === user.userID) {
      groomings[user.roomID].participants[key].nickname = newNickName;
    }
  }

  return groomings[user.roomID];
};

module.exports = {
  checkRoomExistance,
  generateNewRoom,
  getRooms,
  logRooms,
  handleJoinRoom,
  getGrooming,
  leaveUserFromGrooming,
  updateParticipantsVote,
  getResults,
  resetVotes,
  cleanRoomsAndUsers,
  updateNickName,
  removeUserFromOngoingGrooming,
  setIssues,
  updateTimer,
  updateAvatar,
  setGurubuAI,
  updateProfilePicture
};
