// Modules
const exec = require('child_process')
const fkill = require('fkill');
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const fs = require('fs');
const bodyParser = require('body-parser');
const os = require('os');

// Constants
const fkillOptions = {
    force: true,
    silent: true,
    ignoreCase: true
}

// Web server management.
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const port = process.env.PORT || 8080;
const content = fs.readFileSync(__dirname + '\\www\\index.html', 'utf8');

const io = require('socket.io')(http);

app.use(express.static('www'))

app.get('/', urlencodedParser, (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Length', Buffer.byteLength(content));
    res.end(content);
});

app.post('/', urlencodedParser, (req, res) => {
    let isKill = Object.keys(req.body).includes('killrequest');
    let isOpen = Object.keys(req.body).includes('openrequest');
    let isStatus = Object.keys(req.body).includes('statusrequest');
    let arg;

    if (isKill) {
        arg = req.body.killrequest;

        closeApplication(arg)
        respondStatus(res, 'tasks killed successfully', 200);
        return
    }
    if (isOpen) {
        arg = req.body.openrequest;
        openApplication(arg)
        respondStatus(res, 'task opened successfully', 200);
        return;
    }
    if (isStatus) {
        arg = req.body.statusrequest;
        statusResponse(arg, res)
        return;
    }
    respondStatus(res, 'cannot complete request...', 500);
});


http.listen(port, () => {
    console.log(`listening on *:${port}`);
});

// Socket.io integrations

io.on('connection', socket => {
    socket.emit('initial', [`${os.type()} [Version ${os.release}]`, 'system']);
    socket.emit('initial', [`(c) 2021 Microsoft Corporation. All rights reserved`, 'system']);
    socket.emit('initial', 'eof');
});

// Functions
function renderResponse(content) {
    let style = "font-family: 'Segoe UI', sans-serif; font-weight: bold;"
    return `<p style="${style}">${content}</p>`
}

function genericCallback(err, data, prefix="") {
    if (err) {
        io.emit('update', [`> ${prefix}${err}`, 'system']);
        //io.emit('update', [`> Could be related to killing an active task that was spawned via platform`, 'system']);
    }
    if (data) {
        io.emit('update', [`> ${prefix}${data}`, 'system']);
    }
}

function splitArgument(arg) {
    let process;
    let secondaryProcess;
    let splitProcessString;

    if (arg.includes(',')) {
        splitProcessString = arg.split(/(, )|,/);
        process = splitProcessString[0];
        secondaryProcess = splitProcessString[2];
    } else {
        splitProcessString = arg.split(/(, )|,/);
        process = splitProcessString[0];
        secondaryProcess = splitProcessString[0];
    }
    return [process, secondaryProcess];
}

function openApplication(arg) {
    let splitArray = splitArgument(arg);
    let process = splitArray[0];

    exec.spawn('cmd', ["/k", process], {
        detached: true
    }).unref();
    
};

function closeApplication(arg) {
    let splitArray = splitArgument(arg);

    splitArray.forEach((processTag) => {
        fkill(processTag, fkillOptions)
    })
};

function statusResponse(arg, res) {
    let splitArray = splitArgument(arg);
    let process = splitArray[0];
    let secondaryProcess = splitArray[1];
    let processTag = (process != secondaryProcess ? secondaryProcess : process)

    exec.execFile('tasklist', (err, stdout, stderr) => {
        let result = (stdout.toLowerCase().indexOf(processTag.toLowerCase()) > -1);
        let online = '<span class="online">process online</span>';
        let offline = '<span class="offline">process offline</span>';
        respondStatus(res, `service status for ${processTag}: ${result ? online : offline}`, 200)
    });
}


// This sends the responses to res. 
function respondStatus(res, confirm, status=200) {
    io.emit('update', ['> ' + confirm, 'temporary name']);
    res.set({'Content-Type': 'text/html'})
        .status(status)
        .send(renderResponse(confirm));
}