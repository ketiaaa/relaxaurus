const axios = require('axios');
require('dotenv').config();

const baseURL = `http://${process.env.REST_HOST}:${process.env.REST_PORT}/v1/api`;
const auth = Buffer.from(`admin:${process.env.ADMIN_PASSWORD}`).toString('base64');
const headers = { Authorization: `Basic ${auth}` };
const axiosConfig = { headers, timeout: 10000 };

module.exports = { baseURL, headers, axiosConfig };
