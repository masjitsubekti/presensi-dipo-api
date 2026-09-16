require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/prisma');

/**
 * Auth Service
 * Handles login, logout, me, changePassword, forgotPassword, resetPassword
 */

/**
 * Login user with username and password
 * @param {string} username
 * @param {string} password
 * @returns {Object} - token and user data
 */
const login = async (username, password) => {
  const user = await prisma.authUser.findFirst({
    where: {
      OR: [{ username }, { email: username }],
      isDeleted: false,
    },
    include: { role: true },
  });

  if (!user) {
    throw { status: 500, message: 'Username atau password yang Anda masukkan salah. Silakan coba lagi.' };
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw { status: 500, message: 'Username atau password yang Anda masukkan salah. Silakan coba lagi.' };
  }

  if (!user.active) {
    throw { status: 500, message: 'Akun Anda tidak aktif. Hubungi administrator.' };
  }

  let personInfo = null;
  if (user.personId) {
    personInfo = await prisma.mPerson.findFirst({
      where: { id: Number(user.personId), isDeleted: false },
      include: { institution: true, department: true, position: true },
    });
  }

  let institutionInfo = null;
  if (user.institutionId && !personInfo?.institution) {
    institutionInfo = await prisma.mInstitution.findFirst({
      where: { id: Number(user.institutionId), isDeleted: false },
    });
  }

  const institutionName = personInfo?.institution?.name || institutionInfo?.name || null;
  const departmentName = personInfo?.department?.name || null;
  const positionName = personInfo?.position?.name || null;

  const finalInstitutionId = user.institutionId ? Number(user.institutionId) : (personInfo?.institutionId ? Number(personInfo.institutionId) : null);
  const finalPersonId = user.personId ? Number(user.personId) : null;

  const payload = {
    id: user.id,
    username: user.username,
    roleId: user.roleId,
    institutionId: finalInstitutionId,
    personId: finalPersonId,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  return {
    token: {
      accessToken: token,
    },
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      status: user.status,
      roleId: user.roleId,
      personId: user.personId ? Number(user.personId) : null,
      organizationId: user.organizationId ? Number(user.organizationId) : null,
      institutionId: user.institutionId ? Number(user.institutionId) : null,
      institutionName,
      departmentName,
      positionName,
      foto: user.foto,
      active: user.active,
      role: user.role
        ? {
            id: user.role.id,
            name: user.role.name,
            description: user.role.description,
          }
        : null,
    },
  };
};

/**
 * Get current user info (me)
 * @param {string} userId
 * @returns {Object}
 */
const me = async (userId) => {
  const user = await prisma.authUser.findFirst({
    where: { id: userId, isDeleted: false },
    include: { role: true },
  });

  if (!user) {
    throw { status: 404, message: 'User tidak ditemukan' };
  }

  let personInfo = null;
  if (user.personId) {
    personInfo = await prisma.mPerson.findFirst({
      where: { id: Number(user.personId), isDeleted: false },
      include: { institution: true, department: true, position: true },
    });
  }

  let institutionInfo = null;
  if (user.institutionId && !personInfo?.institution) {
    institutionInfo = await prisma.mInstitution.findFirst({
      where: { id: Number(user.institutionId), isDeleted: false },
    });
  }

  const institutionName = personInfo?.institution?.name || institutionInfo?.name || null;
  const departmentName = personInfo?.department?.name || null;
  const positionName = personInfo?.position?.name || null;

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email ?? '',
    status: user.status,
    roleId: user.roleId,
    personId: user.personId ? Number(user.personId) : null,
    organizationId: user.organizationId ? Number(user.organizationId) : null,
    institutionId: user.institutionId ? Number(user.institutionId) : null,
    institutionName,
    departmentName,
    positionName,
    roleName: user.role?.name ?? null,
    foto: user.foto,
    active: user.active,
  };
};

/**
 * Change password for authenticated user
 * @param {string} userId
 * @param {string} oldPassword
 * @param {string} newPassword
 */
const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await prisma.authUser.findFirst({
    where: { id: userId, isDeleted: false },
  });

  if (!user) {
    throw { status: 404, message: 'User tidak ditemukan' };
  }

  const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
  if (!isOldPasswordValid) {
    throw { status: 400, message: 'Password lama yang Anda masukkan tidak sesuai' };
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw { status: 400, message: 'Password baru tidak boleh sama dengan password lama' };
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.authUser.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });
};

/**
 * Forgot password - generate reset token
 * @param {string} email
 * @returns {string} reset token
 */
const forgotPassword = async (email) => {
  const user = await prisma.authUser.findFirst({
    where: { email, isDeleted: false },
  });

  if (!user) {
    throw { status: 404, message: 'Email tidak ditemukan' };
  }

  const token = crypto.randomBytes(30).toString('hex');
  const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await prisma.authUser.update({
    where: { id: user.id },
    data: {
      resetToken: token,
      resetTokenExpiry: expiry,
    },
  });

  return token;
};

/**
 * Reset password with token
 * @param {string} token
 * @param {string} newPassword
 */
const resetPassword = async (token, newPassword) => {
  const user = await prisma.authUser.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
      isDeleted: false,
    },
  });

  if (!user) {
    throw { status: 400, message: 'Token reset tidak valid atau sudah kedaluwarsa' };
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.authUser.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });
};

module.exports = {
  login,
  me,
  changePassword,
  forgotPassword,
  resetPassword,
};
