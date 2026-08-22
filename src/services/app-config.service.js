const prisma = require('../config/prisma');

/**
 * AppConfig Service
 */

const getById = async (id) => {
  const config = await prisma.appConfig.findFirst({
    where: { id: BigInt(id) },
  });
  if (!config) throw { status: 404, message: 'AppConfig tidak ditemukan' };
  return { ...config, id: config.id.toString() };
};

const update = async (id, data) => {
  await getById(id);
  const updated = await prisma.appConfig.update({
    where: { id: BigInt(id) },
    data: {
      value: data.value ?? null,
      label: data.label ?? null,
    },
  });
  return { ...updated, id: updated.id.toString() };
};

module.exports = { getById, update };
