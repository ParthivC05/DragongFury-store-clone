const { updateProfile } = require('./updateProfile.service');
const { updateProfilePhoto } = require('./updateProfilePhoto.service');
const { changePassword } = require('./changePassword.service');

module.exports = {
  updateProfile,
  updateProfilePhoto,
  changePassword
};
