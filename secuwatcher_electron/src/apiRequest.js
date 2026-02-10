import axios from 'axios';

const apiPython = axios.create({
  baseURL: 'http://127.0.0.1:5001'
})

export default apiPython;