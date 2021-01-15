"use strict"
const express = require('express')
const exec = require('child_process').execFile;
const fkill = require('fkill');

const app = express()
const port = process.env.PORT || 8080;
const appName = ['calc.exe', 'calculator.exe']

app.use(express.static('www'));
app.use(express.urlencoded({
    extended: true
}));

// Functions
function renderResponse(content, style="font-family: 'Segoe UI', sans-serif;") {
    return `<p style="${style}">${content}</p>`
}

function genericCallback(err, data) {
    if (err) console.log("An unexpected error occured!", err);
    if (data) console.log(data);
};

function openApplication() {
    exec(appName[0], genericCallback);
};

function closeApplication() {
    fkill(appName[1], {
        force: true,
        silent: true,
        ignoreCase: true
    })
};

// Post
app.post('/', function(req, res) {
    let isKill = Object.values(req.body).includes('Kill Task');
    let isOpen = Object.values(req.body).includes('Open Task');

    res.set({
        'Content-Type': 'text/html',
      })

    if (isKill) {
        closeApplication();
        res.status(200).send(renderResponse("Task killed..."));
        return;
    }

    if (isOpen) {
        openApplication();
        res.status(200).send(renderResponse("Task opened..."));
        return;
    }

    // If it gets to this point without any action, it needs to send an internal server error.
    res.sendStatus(500).send(renderResponse("Something awful happened..."));
});

// Server listen
var server = app.listen(port, function() {

    var _host = server.address().address
    var _port = server.address().port

    console.log('Express app listening at http://%s:%s', _host, _port);

})