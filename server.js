const express = require('express');
const basicAuth = require('express-basic-auth');
const path = require('path');

const app = express();

// Add basic authentication
app.use(basicAuth({
    users: { 'wapipay': 'Cani$can3med!t' }, // Change these credentials
    challenge: true,
    realm: 'Alpha Tribe Dashboard',
}));

// Serve static files from the React build
app.use(express.static(path.join(__dirname, 'build')));

// Handle React routing, return all requests to React app
app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
