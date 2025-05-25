import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { api as apiConfig, users, saveUserFile, encryptionKey } from './config.js';
import { encrypt, decrypt } from './utils.js';
import { generateAuthUrl, processAuth, deleteAuth, loadApi, createCalendar } from './google.js';
import { auth } from 'googleapis/build/src/apis/abusiveexperiencereport/index.js';
import { streamListeners } from './logs.js';

export const app = express();
let tokens = [];

app.use(express.json());
app.use(cookieParser());

app.get('/api/auth', async (req, res) => {

    try {
        let token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        if (token) {
            if (tokens.includes(token)) {
                if (await new Promise((resolve) => { jwt.verify(token, apiConfig.token_secret, (err, user) => {
                    if (!err) {
                        res.json({
                            name: user.name,
                            fullname: users[user.name]?.fullname,
                            token: token,
                        })
                        resolve(true);
                    }
                    resolve(false);
                })})) return;
            }
        }

        const username = req.query && req.query.username;
        if (!username) return res.sendStatus(400);
        
        const user = users[username];
        if (!user) return res.sendStatus(400);

        if (!user.password) return res.status(401).json({ name: username, fullname: user.fullname });

        res.status(403).json({ name: username, fullname: user.fullname });

    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }

});

app.post('/api/auth', async (req, res) => {

    try {
        let token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        if (token) {
            if (tokens.includes(token)) {
                if (await new Promise((resolve) => { jwt.verify(token, apiConfig.token_secret, (err, user) => {
                    if (!err) {
                        console.info('[api]', 'User', user.username, 'already logged in');
                        res.json({
                            name: user.name,
                            fullname: users[user.name]?.fullname,
                            token: token,
                        })
                        resolve(true);
                    }
                    resolve(false);
                })})) return;
            }
        }

        const username = req.body && req.body.username;
        const password = req.body && req.body.password;
        if (!username || !password) return res.sendStatus(400);

        const user = users[username];
        if (!user) return res.sendStatus(400);

        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(password, salt);

        if (!user.password) {
            console.info('[api]', 'Initialized new password for user', username);
            user.password = hashedPassword;
            user.password_created = new Date();
            await saveUserFile(username, user);
        }
        else if (!await bcrypt.compare(password, user.password)) {
            console.info('[api]', 'Failed login attempt for user', username);
            return res.sendStatus(401);
        }
        else {
            console.info('[api]', 'User', username, 'logged in');
        }

        token = generateToken(username);
        tokens.push(token);

        res.cookie('token', token, {
            httpOnly: true,
            secure: apiConfig.https,
            sameSite: 'lax',
            maxAge: 3 * 60 * 60 * 1000,
        });

        res.json({
            name: username,
            fullname: user.fullname,
            token: token,
        });
    }
    catch (err) {
        console.error(err);
        res.sendStatus(500);
    }

});

app.delete('/api/auth', authenticate, (req, res) => {

    console.info('[api]', 'User', req.username, 'logged out');

    tokens = tokens.filter(t => t !== req.token);

    res.clearCookie('token', {
        httpOnly: true,
        secure: apiConfig.https,
        sameSite: 'lax',
    });

    return res.sendStatus(204);

});

app.get('/api/oauth2/google', authenticate, refresh, (req, res) => {

    const authUrl = generateAuthUrl();
    res.redirect(authUrl);

});

app.get('/api/oauth2/google/callback', authenticate, refresh, async (req, res) => {
    
    const code = req.query?.code;
    const success = await processAuth(req.username, code);
    if (!success) res.status(500).send(
        'Something went wrong while processing Google OAuth!<br/>' +
        'Please contact the admin and try again.<br/>' +
        `<a href="/${req.username}">Back to dashboard</a>`);
    res.redirect(`/${req.username}`);

});

app.delete('/api/oauth2/google', authenticate, refresh, async (req, res) => {

    await deleteAuth(req.username);
    res.sendStatus(204);

});

app.get('/api/config', authenticate, refresh, (req, res) => {

    if (!req.user) return res.status(400).json({ token: req.token });

    res.json({
        name: req.username,
        fullname: req.user.fullname,
        active: req.user.active,
        webuntis: req.user.webuntis,
        google: req.user.google,
        refresh: req.user.refresh,
        refreshProfile: req.user.refreshProfile,
        token: req.token
    });

});

app.put('/api/config', authenticate, refresh, async (req, res) => {

    try {
        if (!req.user) return res.status(400).json({ token: req.token });

        const newConfig = req.body;
        if (!newConfig) return res.status(400).json({ token: req.token });

        console.info('[api]', 'User', req.username, 'updated config');

        req.user.fullname = newConfig.fullname || req.user.fullname;
        req.user.active = newConfig.active || req.user.active;
        req.user.webuntis = newConfig.webuntis || req.user.webuntis;
        req.user.google = newConfig.google || req.user.google;
        req.user.refresh = newConfig.refresh || req.user.refresh;       

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

});

app.put('/api/webuntis/password', authenticate, refresh, async (req, res) => {

    try {
        if (!req.user) return res.status(400).json({ token: req.token });

        const password = req.body && req.body.password;
        if (!password) return res.status(400).json({ token: req.token });

        console.info('[api]', 'User', req.username, 'updated webuntis password');

        req.user.webuntis_password = encrypt(password, encryptionKey);
        req.user.webuntis.password_configured = new Date();

        await saveUserFile(req.username, req.user);

        res.status(200).json({ token: req.token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ token: req.token });
    }

});

app.delete('/api/webuntis/password', authenticate, refresh, async (req, res) => {

    try {
        if (!req.user) return res.status(400).json({ token: req.token });

        console.info('[api]', 'User', req.username, 'deleted webuntis password');

        req.user.webuntis_password = '';
        req.user.webuntis.password_configured = '';

        await saveUserFile(req.username, req.user);

        res.status(204).json({ token: req.token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ token: req.token });
    }

});

app.post('/api/google/calendar', authenticate, refresh, async (req, res) => {

    try {
        if (!req.user) return res.status(400).json({ token: req.token });

        const title = req.body && req.body.title;
        const description = req.body && req.body.description || '';
        if (!title) return res.status(400).json({ token: req.token });

        console.info('[api]', 'User', req.username, 'creates new Google calendar');

        const api = await loadApi(req.username);
        if (!api) return res.status(500).json({ token: req.token, error: 'Failed to load Google Calendar API: Please reauthorize!' });

        const calendarId = await createCalendar(req.username, api, title, description);
        if (!calendarId) return res.status(500).json({ token: req.token, error: 'Failed to create Google calendar!' });

        res.status(200).json({ token: req.token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ token: req.token, error: 'Failed to create Google calendar!' });
    }

});

app.post('/api/sync', authenticate, refresh, async (req, res) => {

    try {
        if (!req.user) return res.status(400).json({ token: req.token });

        console.info('[api]', 'User', req.username, 'requested sync');
        // Here you would typically trigger a sync process, e.g., with WebUntis or Google Calendar

        res.status(200).json({ token: req.token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ token: req.token, error: 'Failed to trigger sync!' });
    }

});

app.get('/api/logs/stream', authenticate, refresh, (req, res) => {

    if (!req.user) return res.status(400).json({ token: req.token });

    console.info('[api]', 'Opening log stream for user', req.username);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    const listener = (data) => {
        try {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
        catch (e) {
            console.error('[api]', `Error writing to log stream for user ${req.username}:`, e);
            console.info('[api]', 'Closing log stream for user', req.username);
            const listeners = streamListeners.get(req.username) || [];
            streamListeners.set(req.username, listeners.filter(l => l !== listener));
            res.end();
        }
    };

    const listeners = streamListeners.get(req.username) || [];
    listeners.push(listener);
    streamListeners.set(req.username, listeners);

    req.on('close', () => {
        console.info('[api]', 'Closing log stream for user', req.username);
        const listeners = streamListeners.get(req.username) || [];
        streamListeners.set(req.username, listeners.filter(l => l !== listener));
        res.end();
    });

});

function generateToken(username) {

    return jwt.sign({name: username}, apiConfig.token_secret, { expiresIn: '3h' });

}

function authenticate(req, res, next) {

    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) return res.sendStatus(401);

    if (!tokens.includes(token)) return res.sendStatus(403);

    jwt.verify(token, apiConfig.token_secret, (err, user) => {
        if (err) {
            tokens = tokens.filter(t => t !== token);
            return res.sendStatus(403);
        }
        req.username = user.name;
        req.token = token;
        req.user = users[user.name];
        next();
    });

}

function refresh(req, res, next) {

    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    tokens = tokens.filter(t => t !== token);

    jwt.verify(token, apiConfig.token_secret, (err, user) => {
        if (!err) {
            const newToken = generateToken(user.name);
            tokens.push(newToken);
            res.cookie('token', newToken, {
                httpOnly: true,
                secure: apiConfig.https,
                sameSite: 'lax',
                maxAge: 3 * 60 * 60 * 1000,
            });
            req.token = newToken;
        }
        next();
    });

}
