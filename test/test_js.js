function processData({ data, options }) {
    return (data * options.factor);
  }
  console.log("Processed data: ", processData({data: 100, options: {factor: 1.5}}))