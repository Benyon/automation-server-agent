// Modules
const util = require('util');
const exec = require('child_process')
const execFile = util.promisify(exec.execFile);
const promExec = util.promisify(exec.exec);
const fkill = require('fkill');
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const fs = require('fs');
const bodyParser = require('body-parser');
const os = require('os');
const isAdmin = require('is-admin');
const minify = require('express-minify');

app.use(minify());
app.use(express.static('www'))

isAdmin().then(elevated => {
    if (!elevated) {
        console.log('Please run node server in administration mode...', '\nending service..');
        process.exit();
    }
});

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

app.get('/', urlencodedParser, (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Length', Buffer.byteLength(content));
    res.end(content);
});

app.post('/task', urlencodedParser, async (req, res) => {
    let isKill = Object.keys(req.body).includes('killrequest');
    let isOpen = Object.keys(req.body).includes('openrequest');
    let isStatus = Object.keys(req.body).includes('statusrequest');
    let arg;
    let result;

    if (isKill) {
        arg = req.body.killrequest;
        result = await closeApplication(arg)
        respondStatus(res, result ? 'task closed successfully' : null, 200);
        return
    }
    if (isOpen) {
        arg = req.body.openrequest;
        result = await openApplication(arg)
        respondStatus(res, result ? 'task opened successfully' : null , 200);
        return;
    }
    if (isStatus) {
        arg = req.body.statusrequest;
        statusResponse(arg, res)
        return;
    }
    respondStatus(res, 'cannot complete request...', 500);
});

app.post('/service', urlencodedParser, async (req, res) => {
    let isEnd = Object.keys(req.body).includes('killrequest');
    let isStart = Object.keys(req.body).includes('openrequest');
    let isStatus = Object.keys(req.body).includes('statusrequest');
    let arg;

    if (isEnd) {
        io.emit('update', ['> request is being processed...', 'system-loading']);
        arg = req.body.killrequest;
        await endService(arg);
        respondStatus(res, null, 200);
        return
    }
    if (isStart) {
        io.emit('update', ['> request is being processed...', 'system-loading']);
        arg = req.body.openrequest;
        await startService(arg);
        respondStatus(res, null, 200);
        return;
    }
    if (isStatus) {
        arg = req.body.statusrequest;
        await serviceStatus(arg, res);
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
async function startService(arg) {
    try {
        const {stdout} = await promExec(`net start ${arg}`);
        if (stdout!=null) {
            io.emit('update', [`> ${stdout}`, 'temporary name']);
        } else {
            io.emit('update', [`> No information recieved from the server`, 'temporary name']);
        }
    } catch (e) {
        io.emit('update', [`> ${e}`, 'temporary name']);
    }
}

async function endService(arg) {
    try {
        const {stdout} = await promExec(`net stop ${arg}`);
        if (stdout!=null) {
            io.emit('update', [`> ${stdout}`, 'temporary name']);
        } else {
            io.emit('update', [`> No information recieved from the server`, 'temporary name']);
        }
    } catch (e) {
        io.emit('update', [`> ${e}`, 'temporary name']);
    }
}

async function serviceStatus(arg, res) {
    let result;
    try {
        const {stdout,} = await promExec(`sc query ${arg}`);
        result = (stdout.toLowerCase().indexOf("running") > -1);
        let online = '<span class="online">service online</span>';
        let offline = '<span class="offline">service offline</span>';
        respondStatus(res, `service status for ${arg}: ${result ? online : offline}`, 200)
    } catch (e) {
        respondStatus(res, `> ${e}`, 200)
    }
}

function renderResponse(content) {
    let style = "font-family: 'Segoe UI', sans-serif; font-weight: bold;"
    return `<p style="${style}">${content}</p>`
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

async function openApplication(arg) {
    let splitArray = splitArgument(arg);
    let process = splitArray[0];
    try {
        await promExec(`${process}`); // TODO we're awaiting creating the function, but this hands the cmd for child_process, we need to detach the cmd process and unref()
        return true;
    } catch (e) {
        if (String(e).includes('is not recognized as an internal or external command'))
        io.emit('update', [`> task could not be opened, please check filepath or executable name.`, 'system']);
        return false;
    }
};

async function closeApplication(arg) {
    let splitArray = splitArgument(arg);

    let {stdout} = await execFile('tasklist');

    let result = [
        (stdout.toLowerCase().indexOf(splitArray[0].toLowerCase()) > -1),
        (stdout.toLowerCase().indexOf(splitArray[1].toLowerCase()) > -1),
    ];

    processToKill = (result[0] ? splitArray[0] : (result[1] ? splitArray[1] : null))

    if (result.includes(true)) {
        result.forEach((val, i) => {
            if (val) {
                fkill(splitArray[i], fkillOptions);
            }
        })
        return true;
    } else {
        io.emit('update', [`> cannot find active process named ${splitArray[0]} or similar`, 'system']);

    }
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
        respondStatus(res, `task status for ${processTag}: ${result ? online : offline}`, 200)
    });
}


// This sends the responses to ${res} 
function respondStatus(res, confirm, status=200) {
    if (confirm!=null) {
        io.emit('update', ['> ' + confirm, 'temporary name']);
    }
    res.set({'Content-Type': 'text/html'})
        .status(status)
        .send(renderResponse(confirm));
}