module.exports = {
  hasHardwareAsync: async () => false,
  isEnrolledAsync: async () => false,
  authenticateAsync: async () => ({ success: true }),
};
