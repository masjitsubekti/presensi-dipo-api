const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Seeder for School Management Backend...');

  // ==================== 1. Roles ====================
  console.log('📦 Seeding Auth Roles...');
  const roles = [
    { id: 'HA01', name: 'Superadmin' },
    { id: 'HA02', name: 'Administrator' },
    { id: 'HA03', name: 'Guru' },
    { id: 'HA04', name: 'Staf' },
  ];
  for (const r of roles) {
    const roleWithSameName = await prisma.authRole.findFirst({ where: { name: r.name, id: { not: r.id } } });
    
    await prisma.authRole.upsert({
      where: { id: r.id },
      update: { name: `${r.name}_temp` },
      create: { id: r.id, name: `${r.name}_temp` },
    });

    if (roleWithSameName) {
      await prisma.authUser.updateMany({ where: { roleId: roleWithSameName.id }, data: { roleId: r.id } });
      await prisma.cMenuRole.deleteMany({ where: { roleId: roleWithSameName.id } });
      await prisma.authRole.delete({ where: { id: roleWithSameName.id } });
    }

    await prisma.authRole.update({
      where: { id: r.id },
      data: { name: r.name },
    });
  }

  // ==================== 2. Auth Users ====================
  console.log('👤 Seeding Auth Users...');
  const superadminPassword = await bcrypt.hash('12345678', 10);
  const adminPassword = await bcrypt.hash('12345678', 10);

  await prisma.authUser.upsert({
    where: { username: 'superadmin' },
    update: { password: superadminPassword, active: true },
    create: {
      username: 'superadmin',
      name: 'superadmin',
      email: 'superadmin@example.com',
      password: superadminPassword,
      roleId: 'HA01',
      active: true,
      status: '1',
    },
  });

  await prisma.authUser.upsert({
    where: { username: 'admin' },
    update: { password: adminPassword, active: true },
    create: {
      username: 'admin',
      name: 'Super Admin',
      email: 'admin@school.id',
      password: adminPassword,
      roleId: 'HA02',
      active: true,
      status: '1',
    },
  });

  // ==================== 3. Menus & Menu Roles ====================
  console.log('📋 Seeding Menus & Menu Roles...');
  const menus = [
    {
      id: 1,
      name: 'Dashboard',
      link: '/dashboard',
      icon: 'ChartDotsIcon',
      description: 'Menu Dashboard',
      level: 1,
      permissionLabel: 'DASHBOARD',
      action: 'VIEW',
      seq: 1,
      parentId: null,
    },
    {
      id: 10,
      name: 'Master Data',
      link: '#',
      icon: 'DatabaseIcon',
      description: 'Menu Master Data',
      level: 1,
      permissionLabel: 'MASTER',
      action: 'VIEW',
      seq: 2,
      parentId: null,
    },
    {
      id: 11,
      name: 'Institusi',
      link: '/master/institution',
      icon: 'PointIcon',
      description: 'Master Institusi',
      level: 2,
      permissionLabel: 'INSTITUTION',
      action: 'VIEW,CREATE,UPDATE,DELETE',
      seq: 1,
      parentId: 10,
    },
    {
      id: 12,
      name: 'Jenjang',
      link: '/master/level',
      icon: 'PointIcon',
      description: 'Master Jenjang',
      level: 2,
      permissionLabel: 'LEVEL',
      action: 'VIEW,CREATE,UPDATE,DELETE',
      seq: 2,
      parentId: 10,
    },
    {
      id: 13,
      name: 'Jabatan',
      link: '/master/position',
      icon: 'PointIcon',
      description: 'Master Jabatan',
      level: 2,
      permissionLabel: 'POSITION',
      action: 'VIEW,CREATE,UPDATE,DELETE',
      seq: 3,
      parentId: 10,
    },
    {
      id: 14,
      name: 'Departemen',
      link: '/master/department',
      icon: 'PointIcon',
      description: 'Master Departemen',
      level: 2,
      permissionLabel: 'DEPARTMENT',
      action: 'VIEW,CREATE,UPDATE,DELETE',
      seq: 4,
      parentId: 10,
    },
    {
      id: 15,
      name: 'Pegawai',
      link: '/master/person',
      icon: 'PointIcon',
      description: 'Master Pegawai & Pengajar',
      level: 2,
      permissionLabel: 'PERSON',
      action: 'VIEW,CREATE,UPDATE,DELETE',
      seq: 5,
      parentId: 10,
    },
    {
      id: 16,
      name: 'Preset Jam Kerja',
      link: '/master/work-time',
      icon: 'PointIcon',
      description: 'Master Preset Jam Kerja',
      level: 2,
      permissionLabel: 'WORK_TIME',
      action: 'VIEW,CREATE,UPDATE,DELETE',
      seq: 6,
      parentId: 10,
    },
    {
      id: 17,
      name: 'Jam Kerja / Shift',
      link: '/master/work-shift',
      icon: 'PointIcon',
      description: 'Master Shift Header Detail',
      level: 2,
      permissionLabel: 'WORK_SHIFT',
      action: 'VIEW,CREATE,UPDATE,DELETE',
      seq: 7,
      parentId: 10,
    },
    {
      id: 18,
      name: 'Penugasan Shift Pegawai',
      link: '/master/work-shift-pattern',
      icon: 'PointIcon',
      description: 'Penugasan Shift Pegawai',
      level: 2,
      permissionLabel: 'WORK_SHIFT_PATTERN',
      action: 'VIEW,CREATE,UPDATE,DELETE',
      seq: 8,
      parentId: 10,
    },
    {
      id: 2,
      name: 'Pengaturan',
      link: '#',
      icon: 'SettingsIcon',
      description: 'Menu Pengaturan',
      level: 1,
      permissionLabel: 'SETTING',
      action: 'VIEW',
      seq: 3,
      parentId: null,
    },
    {
      id: 3,
      name: 'User',
      link: '/setting/user',
      icon: 'PointIcon',
      description: 'Menu User',
      level: 2,
      permissionLabel: 'USER',
      action: 'VIEW,CREATE,UPDATE,DELETE',
      seq: 1,
      parentId: 2,
    },
    {
      id: 4,
      name: 'Menu Hak Akses',
      link: '/setting/menu',
      icon: 'PointIcon',
      description: 'Menu Hak Akses',
      level: 2,
      permissionLabel: 'MENU',
      action: 'VIEW,CREATE,UPDATE,DELETE',
      seq: 2,
      parentId: 2,
    },
  ];

  for (const m of menus) {
    await prisma.cMenu.upsert({
      where: { id: m.id },
      update: {
        name: m.name,
        link: m.link,
        icon: m.icon,
        description: m.description,
        level: m.level,
        permissionLabel: m.permissionLabel,
        action: m.action,
        seq: m.seq,
        parentId: m.parentId,
      },
      create: {
        id: m.id,
        name: m.name,
        link: m.link,
        icon: m.icon,
        description: m.description,
        level: m.level,
        permissionLabel: m.permissionLabel,
        action: m.action,
        seq: m.seq,
        parentId: m.parentId,
      },
    });

    // Assign full permissions for HA01 and ADMIN
    for (const roleId of ['HA01', 'HA02']) {
      const existing = await prisma.cMenuRole.findFirst({
        where: { menuId: m.id, roleId: roleId },
      });

      if (existing) {
        await prisma.cMenuRole.update({
          where: { id: existing.id },
          data: { permission: m.action, mainPage: m.id === 1 },
        });
      } else {
        await prisma.cMenuRole.create({
          data: {
            menuId: m.id,
            roleId: roleId,
            permission: m.action,
            mainPage: m.id === 1,
          },
        });
      }
    }
  }

  // ==================== 4. Master Levels ====================
  console.log('🏫 Seeding Master Levels...');
  const levels = [
    { code: 'TK', name: 'TK / PAUD', seq: 1 },
    { code: 'SD', name: 'SD / MI', seq: 2 },
    { code: 'SMP', name: 'SMP / MTs', seq: 3 },
    { code: 'SMA', name: 'SMA / MA', seq: 4 },
    { code: 'SMK', name: 'SMK', seq: 5 },
  ];
  for (const l of levels) {
    await prisma.mLevel.upsert({
      where: { code: l.code },
      update: { name: l.name, seq: l.seq, is_active: true },
      create: { code: l.code, name: l.name, seq: l.seq, is_active: true },
    });
  }

  const levelSma = await prisma.mLevel.findUnique({ where: { code: 'SMA' } });

  // ==================== 5. Master Institution ====================
  console.log('🏢 Seeding Master Institution...');
  let institution = await prisma.mInstitution.findFirst({ where: { code: 'INST-01' } });
  if (!institution) {
    institution = await prisma.mInstitution.create({
      data: {
        code: 'INST-01',
        name: 'SMA Negeri 1 Jakarta',
        levelId: levelSma ? levelSma.id : null,
        npsn: '20100101',
        address: 'Jl. Budi Utomo No. 7, Jakarta Pusat',
        phone: '021-3865001',
        email: 'info@sman1jakarta.sch.id',
        isActive: true,
      },
    });
  }

  // ==================== 6. Master Department ====================
  console.log('📁 Seeding Master Department...');
  let dept = await prisma.mDepartment.findFirst({ where: { code: 'DEPT-AKADEMIK' } });
  if (!dept) {
    dept = await prisma.mDepartment.create({
      data: {
        code: 'DEPT-AKADEMIK',
        name: 'Departemen Akademik & Kurikulum',
        institutionId: institution.id,
      },
    });
  }

  // ==================== 7. Master Position ====================
  console.log('💼 Seeding Master Position...');
  let pos = await prisma.mPosition.findFirst({ where: { code: 'POS-GURU' } });
  if (!pos) {
    pos = await prisma.mPosition.create({
      data: {
        code: 'POS-GURU',
        name: 'Guru Mata Pelajaran',
        institutionId: institution.id,
      },
    });
  }

  // ==================== 8. Master Person ====================
  console.log('👨‍🏫 Seeding Master Person...');
  let person = await prisma.mPerson.findFirst({ where: { nip: '198501012010011001' } });
  if (!person) {
    person = await prisma.mPerson.create({
      data: {
        nip: '198501012010011001',
        name: 'Budi Santoso, S.Pd',
        gender: 'L',
        phone: '081234567890',
        email: 'budi.santoso@sman1jakarta.sch.id',
        institutionId: institution.id,
        departmentId: dept.id,
        positionId: pos.id,
        status: 'aktif',
      },
    });
  }

  // ==================== 9. Master Work Time ====================
  console.log('⏰ Seeding Master Work Time...');
  let workTime = await prisma.mWorkTime.findFirst({ where: { code: 'JAM-REGULER' } });
  if (!workTime) {
    workTime = await prisma.mWorkTime.create({
      data: {
        code: 'JAM-REGULER',
        name: 'Jam Reguler Pagi (08:00 - 16:00)',
        workStartTime: '08:00',
        workEndTime: '16:00',
        checkinStart: '07:00',
        checkinEnd: '09:00',
        checkoutStart: '15:30',
        checkoutEnd: '18:00',
        lateTolerance: 15,
        earlyLeaveTolerance: 10,
        isActive: true,
      },
    });
  }

  // ==================== 10. Master Work Shift ====================
  console.log('🔄 Seeding Master Work Shift...');
  let shift = await prisma.workShift.findFirst({ where: { code: 'SHIFT-REG-5HARI' } });
  if (!shift) {
    shift = await prisma.workShift.create({
      data: {
        code: 'SHIFT-REG-5HARI',
        name: 'Shift Reguler 5 Hari Kerja',
        institutionId: institution.id,
        isActive: true,
        details: {
          create: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
            dayOfWeek: day,
            isWorkingDay: day <= 5,
            workTimeId: day <= 5 ? workTime.id : null,
          })),
        },
      },
    });
  }

  // ==================== 11. Work Shift Pattern ====================
  console.log('📅 Seeding Work Shift Pattern...');
  let pattern = await prisma.workShiftPattern.findFirst({
    where: { personId: person.id, shiftId: shift.id },
  });
  if (!pattern) {
    await prisma.workShiftPattern.create({
      data: {
        personId: person.id,
        shiftId: shift.id,
        effectiveFrom: new Date('2026-01-01'),
      },
    });
  }

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
