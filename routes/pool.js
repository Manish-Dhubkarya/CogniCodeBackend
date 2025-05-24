var mysql = require("mysql")
var pool = mysql.createPool({
    host: "localhost",
    port: 3310,
    user: 'root',
    password: "1234",
    database: "cognicode_db",
    multipleStatements: true,
    connectionLimit: 100,
})
module.exports = pool;