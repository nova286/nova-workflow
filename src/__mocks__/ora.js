const ora = () => ({
  start: () => ora(),
  succeed: () => ora(),
  fail: () => ora(),
  stop: () => ora(),
  text: '',
});
module.exports = ora;
