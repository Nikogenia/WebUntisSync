import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { query, body, validationResult } from "express-validator";
import he from "he";
import {
  api as apiConfig,
  users,
  saveUserFile,
  encryptionKey,
} from "./config.js";
import { encrypt } from "./utils.js";
import {
  generateAuthUrl,
  processAuth,
  deleteAuth,
  loadApi,
  createCalendar,
} from "./google.js";
import { streamListeners, loadLogs } from "./logs.js";
import { refreshUser } from "./index.js";

export const app = express();
let tokens = [];

app.set("trust proxy", apiConfig.proxy);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    message: "Too many requests, please try again later.",
  })
);
app.use(express.json());
app.use(cookieParser());

app.get(
  "/api/auth",
  [query("username").isString().trim().notEmpty()],
  async (req, res) => {
    try {
      let token = req.cookies.token || req.headers.authorization?.split(" ")[1];
      if (token) {
        if (tokens.includes(token)) {
          if (
            await new Promise((resolve) => {
              jwt.verify(token, apiConfig.token_secret, (err, user) => {
                if (!err) {
                  res.json({
                    name: user.name,
                    fullname: users[user.name]?.fullname,
                    token: token,
                  });
                  resolve(true);
                }
                resolve(false);
              });
            })
          )
            return;
        }
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const username = req.query.username;
      const user = users[username];
      if (!user) return res.sendStatus(400);

      if (!user.password)
        return res
          .status(401)
          .json({ name: username, fullname: user.fullname });

      res.status(403).json({ name: username, fullname: user.fullname });
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  }
);

app.post(
  "/api/auth",
  [
    body("username").isString().trim().notEmpty(),
    body("password").isString().trim().isLength({ min: 8, max: 100 }),
  ],
  async (req, res) => {
    try {
      let token = req.cookies.token || req.headers.authorization?.split(" ")[1];
      if (token) {
        if (tokens.includes(token)) {
          if (
            await new Promise((resolve) => {
              jwt.verify(token, apiConfig.token_secret, (err, user) => {
                if (!err) {
                  console.info(
                    "[api]",
                    "User",
                    user.username,
                    "already logged in"
                  );
                  res.json({
                    name: user.name,
                    fullname: users[user.name]?.fullname,
                    token: token,
                  });
                  resolve(true);
                }
                resolve(false);
              });
            })
          )
            return;
        }
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const username = req.body.username;
      const password = req.body.password;
      const user = users[username];
      if (!user) return res.sendStatus(400);

      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(password, salt);

      if (!user.password) {
        console.info("[api]", "Initialized new password for user", username);
        user.password = hashedPassword;
        user.password_created = new Date();
        await saveUserFile(username, user);
      } else if (!(await bcrypt.compare(password, user.password))) {
        console.info("[api]", "Failed login attempt for user", username);
        return res.sendStatus(401);
      } else {
        console.info("[api]", "User", username, "logged in");
      }

      token = generateToken(username);
      tokens.push(token);

      res.cookie("token", token, {
        httpOnly: true,
        secure: apiConfig.https,
        sameSite: "lax",
        maxAge: 3 * 60 * 60 * 1000,
      });

      res.json({
        name: username,
        fullname: user.fullname,
        token: token,
      });
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  }
);

app.delete("/api/auth", authenticate, (req, res) => {
  console.info("[api]", "User", req.username, "logged out");

  tokens = tokens.filter((t) => t !== req.token);

  res.clearCookie("token", {
    httpOnly: true,
    secure: apiConfig.https,
    sameSite: "lax",
  });

  return res.sendStatus(204);
});

app.get("/api/oauth2/google", authenticate, refresh, (req, res) => {
  const authUrl = generateAuthUrl();
  res.redirect(authUrl);
});

app.get(
  "/api/oauth2/google/callback",
  [
    query("code").optional(),
    query("error").optional(),
    query("error_description").optional(),
  ],
  authenticate,
  refresh,
  async (req, res) => {
    const error = req.query?.error ? he.escape(req.query.error) : "";
    const errorDescription = req.query?.error_description
      ? he.escape(req.query.error_description)
      : "";
    const errorMessage = errorDescription
      ? `${error}: ${errorDescription}`
      : error;
    const code = req.query?.code;
    let success = false;
    if (code) {
      success = await processAuth(req.username, code);
    }
    if (!success) {
      res
        .status(500)
        .send(
          "Something went wrong while processing Google OAuth!<br/>" +
            (errorMessage ? `${errorMessage}<br/>` : "") +
            "Please contact the admin and try again.<br/>" +
            `<a href="/${req.username}">Back to dashboard</a>`
        );
      return;
    }
    res.redirect(`/${req.username}`);
  }
);

app.delete("/api/oauth2/google", authenticate, refresh, async (req, res) => {
  await deleteAuth(req.username);
  res.sendStatus(204);
});

app.get("/api/config", authenticate, refresh, (req, res) => {
  if (!req.user) return res.status(400).json({ token: req.token });

  res.json({
    name: req.username,
    fullname: req.user.fullname,
    active: req.user.active,
    webuntis: req.user.webuntis,
    google: req.user.google,
    refresh: req.user.refresh,
    refreshProfile: req.user.refreshProfile,
    token: req.token,
  });
});

app.put(
  "/api/config",
  [
    body("fullname")
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 50 })
      .escape(),
    body("active").optional().isBoolean(),
    body("webuntis").optional().isObject(),
    body("webuntis.server").optional().isString().trim().escape(),
    body("webuntis.school").optional().isString().trim().escape(),
    body("webuntis.username").optional().isString().trim().escape(),
    body("webuntis.password_configured")
      .optional()
      .custom((value) => {
        return value === "" || !isNaN(Date.parse(value));
      }),
    body("google").optional().isObject(),
    body("google.calendarId").optional().isString().trim().escape(),
    body("google.oauth_configured")
      .optional()
      .custom((value) => {
        return value === "" || !isNaN(Date.parse(value));
      }),
    body("google.examColor").optional().isString().trim().escape(),
    body("google.updatedColor").optional().isString().trim().escape(),
    body("google.cancelledColor").optional().isString().trim().escape(),
    body("google.homeworkColor").optional().isString().trim().escape(),
    body("google.messageOfTheDayColor").optional().isString().trim().escape(),
    body("google.holidayColor").optional().isString().trim().escape(),
    body("refresh").optional().isString().trim().escape(),
  ],
  authenticate,
  refresh,
  async (req, res) => {
    try {
      if (!req.user) return res.status(400).json({ token: req.token });

      const errors = validationResult(req);
      const newConfig = req.body;
      if (!newConfig) return res.status(400).json({ token: req.token });
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ errors: errors.array(), token: req.token });
      }

      console.info("[api]", "User", req.username, "updated config");

      req.user.fullname = newConfig.fullname || req.user.fullname;
      req.user.active =
        newConfig.active !== undefined ? newConfig.active : req.user.active;
      req.user.webuntis = newConfig.webuntis || req.user.webuntis;
      req.user.google = newConfig.google || req.user.google;
      req.user.refresh =
        newConfig.refresh !== undefined ? newConfig.refresh : req.user.refresh;

      await saveUserFile(req.username, req.user);

      res.json({
        name: req.username,
        fullname: req.user.fullname,
        active: req.user.active,
        webuntis: req.user.webuntis,
        google: req.user.google,
        refresh: req.user.refresh,
        refreshProfile: req.user.refreshProfile,
        token: req.token,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ token: req.token });
    }
  }
);

app.put(
  "/api/webuntis/password",
  [body("password").isString().notEmpty()],
  authenticate,
  refresh,
  async (req, res) => {
    try {
      if (!req.user) return res.status(400).json({ token: req.token });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ errors: errors.array(), token: req.token });
      }

      const password = req.body.password;
      console.info("[api]", "User", req.username, "updated webuntis password");

      req.user.webuntis_password = encrypt(password, encryptionKey);
      req.user.webuntis.password_configured = new Date();

      await saveUserFile(req.username, req.user);

      res.status(200).json({ token: req.token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ token: req.token });
    }
  }
);

app.delete(
  "/api/webuntis/password",
  authenticate,
  refresh,
  async (req, res) => {
    try {
      if (!req.user) return res.status(400).json({ token: req.token });

      console.info("[api]", "User", req.username, "deleted webuntis password");

      req.user.webuntis_password = "";
      req.user.webuntis.password_configured = "";

      await saveUserFile(req.username, req.user);

      res.status(204).json({ token: req.token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ token: req.token });
    }
  }
);

app.post(
  "/api/google/calendar",
  [
    body("title").isString().trim().notEmpty(),
    body("description").optional().isString().trim(),
  ],
  authenticate,
  refresh,
  async (req, res) => {
    try {
      if (!req.user) return res.status(400).json({ token: req.token });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ errors: errors.array(), token: req.token });
      }
      const title = req.body.title;
      const description = req.body.description || "";

      console.info(
        "[api]",
        "User",
        req.username,
        "creates new Google calendar"
      );

      const api = await loadApi(req.username);
      if (!api)
        return res.status(500).json({
          token: req.token,
          error: "Failed to load Google Calendar API: Please reauthorize!",
        });

      const calendarId = await createCalendar(
        req.username,
        api,
        title,
        description
      );
      if (!calendarId)
        return res.status(500).json({
          token: req.token,
          error: "Failed to create Google calendar!",
        });

      res.status(200).json({ token: req.token });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ token: req.token, error: "Failed to create Google calendar!" });
    }
  }
);

app.post(
  "/api/sync",
  [body("full_refresh").optional().isBoolean()],
  authenticate,
  refresh,
  async (req, res) => {
    try {
      if (!req.user) return res.status(400).json({ token: req.token });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ errors: errors.array(), token: req.token });
      }
      const fullRefresh = req.body && req.body.full_refresh;

      console.info("[api]", "User", req.username, "requested sync");

      refreshUser(req.username, req.user, fullRefresh);

      res.status(200).json({ token: req.token });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ token: req.token, error: "Failed to trigger sync!" });
    }
  }
);

app.get("/api/logs/stream", authenticate, (req, res) => {
  if (!req.user) return res.status(400).json({ token: req.token });

  console.info("[api]", "Opening log stream for user", req.username);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const closeStream = () => {
    console.info("[api]", "Closing log stream for user", req.username);
    const listeners = streamListeners.get(req.username) || [];
    streamListeners.set(
      req.username,
      listeners.filter((l) => l !== listener)
    );
    clearInterval(keepAlive);
    res.end();
  };

  const keepAlive = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");
    } catch (e) {
      closeStream();
    }
  }, 20000);

  const listener = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.error(
        "[api]",
        `Error writing to log stream for user ${req.username}:`,
        e
      );
      closeStream();
    }
  };

  const listeners = streamListeners.get(req.username) || [];
  listeners.push(listener);
  streamListeners.set(req.username, listeners);

  req.on("close", closeStream);
});

app.get(
  "/api/logs",
  [
    query("before").optional().isInt(),
    query("limit").optional().isInt({ min: 1, max: 10000 }),
  ],
  authenticate,
  refresh,
  async (req, res) => {
    try {
      if (!req.user) return res.status(400).json({ token: req.token });
      const before =
        req.query && req.query.before ? parseInt(req.query.before) : null;
      const limit =
        req.query && req.query.limit ? parseInt(req.query.limit) : 100;
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ errors: errors.array(), token: req.token });
      }
      const logs = await loadLogs(req.username, before, limit);
      res.status(200).json({ token: req.token, logs });
    } catch (err) {
      console.error(err);
      res.status(500).json({ token: req.token });
    }
  }
);

function generateToken(username) {
  return jwt.sign({ name: username }, apiConfig.token_secret, {
    expiresIn: "3h",
  });
}

function authenticate(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

  if (!token) return res.sendStatus(401);

  if (!tokens.includes(token)) return res.sendStatus(403);

  jwt.verify(token, apiConfig.token_secret, (err, user) => {
    if (err) {
      tokens = tokens.filter((t) => t !== token);
      return res.sendStatus(403);
    }
    req.username = user.name;
    req.token = token;
    req.user = users[user.name];
    next();
  });
}

function refresh(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

  tokens = tokens.filter((t) => t !== token);

  jwt.verify(token, apiConfig.token_secret, (err, user) => {
    if (!err) {
      const newToken = generateToken(user.name);
      tokens.push(newToken);
      res.cookie("token", newToken, {
        httpOnly: true,
        secure: apiConfig.https,
        sameSite: "lax",
        maxAge: 3 * 60 * 60 * 1000,
      });
      req.token = newToken;
    }
    next();
  });
}
