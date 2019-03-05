const express = require('express');
const app = express();
const port = 8080;

app.use(express.static('static'));

// TODO: Insert routing here

app.listen(port, () => console.log(`listening on ${port}`));