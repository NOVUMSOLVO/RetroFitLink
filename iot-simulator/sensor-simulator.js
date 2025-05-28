const axios = require('axios');
const { faker } = require('@faker-js/faker');

const API_ENDPOINT = 'http://localhost:5000/api/iot-data';

const simulateSensorData = () => {
  const payload = {
    retrofitId: faker.datatype.uuid(),
    sensorId: `SENSOR-${faker.random.alphaNumeric(6)}`,
    temperature: faker.datatype.number({ min: 18, max: 25 }),
    energyUsage: faker.datatype.number({ min: 5, max: 30 }),
    timestamp: new Date().toISOString()
  };

  axios.post(API_ENDPOINT, payload)
    .then(() => console.log(`Sent data: ${JSON.stringify(payload)}`))
    .catch(err => console.error('Error sending data:', err));
};

// Send data every 5 seconds
setInterval(simulateSensorData, 5000);
