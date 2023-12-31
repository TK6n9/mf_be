const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const passport = require("passport");
const morgan = require("morgan");
const session = require("express-session");
const dotenv = require("dotenv");
const http = require("http");
// const https = require("https");
const fs = require("fs");
const helmet = require("helmet");
const hpp = require("hpp");
const RedisStore = require("connect-redis")(session);
const redis = require("redis");
const socketIo = require("socket.io");
const cors = require("cors");
dotenv.config();

// const redisClient = redis.createClient({
//   host: process.env.REDIS_HOST,
//   port: process.env.REDIS_PORT,
//   password: process.env.REDIS_PASSWORD,
//   logErrors: true,
// });

const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_USERNAME}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}/0`,
  legacyMode: true,
});

redisClient.on("connect", () => {
  console.info("Redis connected!");
});
redisClient.on("error", (err) => {
  console.error("Redis Client Error", err);
});
redisClient.connect().then(); // redis v4 연결 (비동기)
const redisCli = redisClient.v4; // 기본 redisClient 객체는 콜백기반인데 v4버젼은 프로미스 기반이라 사용

const options = {
  key: fs.readFileSync("./rootca.key"),
  cert: fs.readFileSync("./rootca.crt"),
};

const v1 = require("./routes/v1");
const authRouter = require("./routes/auth");
const postRouter = require("./routes/post");
const postsRouter = require("./routes/posts");
const serverRouter = require("./routes/server");
const indexRouter = require("./routes");
const { sequelize } = require("./models");
const passportConfig = require("./passport");

const app = express();
const server = http.createServer(app);
// const server = https.createServer(options, app);

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://43.201.234.99",
    "http://www.cog-mind.com",
  ],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  // 쿠키 전송을 위해 필요
};
const io = socketIo(server, {
  cors: corsOptions,
});

app.use(cors(corsOptions));

passportConfig();

app.set("port", process.env.PORT);
//alter: true  칼럼추가기능
sequelize
  .sync({ force: false })
  .then(() => {
    console.log("데이터베이스 연결 성공");
  })
  .catch((err) => {
    console.error(err);
  });

if (process.env.NODE_ENV === "production") {
  app.enable("trust proxy");
  app.use(morgan("combined"));
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );
  app.use(hpp());
} else {
  app.use(morgan("dev"));
}

app.use(express.static(path.join(__dirname, "uploads")));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 간단한 객체만 허용 true중첩된 객체 허용
app.use(cookieParser(process.env.COOKIE_SECRET));
app.set("io", io);

app.use(
  session({
    saveUninitialized: false,
    resave: false,
    secret: process.env.COOKIE_SECRET,
    cookie: {
      httpOnly: true,
      secure: false,
    },
    store: new RedisStore({ client: redisClient, prefix: "session:" }),
  })
);

app.use(passport.initialize());
app.use(passport.session());
//이미지서버에 접근하게 위에있는데 이상함

app.use("/uploads", express.static("uploads"));

app.use("/v1", v1);
app.use("/auth", authRouter);
app.use("/", indexRouter);
app.use("/post", postRouter);
app.use("/posts", postsRouter);
app.use("/server", serverRouter);

server.listen(app.get("port"), () => {
  console.log(app.get("port"), "번 포트에서 대기중");
});
