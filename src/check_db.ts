import { pool } from './db/connection';

async function check() {
  try {
    console.log('--- RECENT TICKETS ---');
    const [tickets] = await pool.query(`
      SELECT t.id, t.titulo, t.empresa_id, e.nombre as empresa_nombre, 
             t.sucursal_id, s.nombre as sucursal_nombre,
             t.tecnico_id, u.nombre_completo as tecnico_nombre, u.nivel_soporte as tech_nivel,
             t.tecnico_n1_id, t.tecnico_n2_id, t.nivel_soporte as ticket_nivel,
             t.creador_id, uc.nombre_completo as creador_nombre, rc.nombre as creador_rol, uc.nivel_soporte as creador_nivel,
             t.created_at
      FROM ticket t
      LEFT JOIN empresa e ON t.empresa_id = e.id
      LEFT JOIN sucursal s ON t.sucursal_id = s.id
      LEFT JOIN usuario u ON t.tecnico_id = u.id
      LEFT JOIN usuario uc ON t.creador_id = uc.id
      LEFT JOIN rol rc ON uc.rol_id = rc.id
      ORDER BY t.id DESC LIMIT 5
    `);
    console.log(JSON.stringify(tickets, null, 2));

    console.log('--- SUCURSALES & EMPRESAS ---');
    const [allSucs] = await pool.query(`
      SELECT s.id as sucursal_id, s.nombre as sucursal_nombre, s.empresa_id, e.nombre as empresa_nombre,
             us.usuario_id as us_usuario_id, u_us.nombre_completo as us_tech_nombre, u_us.nivel_soporte as us_tech_nivel,
             s.usuario_id as s_usuario_id, u_s.nombre_completo as s_tech_nombre, u_s.nivel_soporte as s_tech_nivel
      FROM sucursal s
      JOIN empresa e ON s.empresa_id = e.id
      LEFT JOIN usuario_sucursal us ON s.id = us.sucursal_id
      LEFT JOIN usuario u_us ON us.usuario_id = u_us.id
      LEFT JOIN usuario u_s ON s.usuario_id = u_s.id
    `);
    console.log(JSON.stringify(allSucs, null, 2));

    console.log('--- ALL TECH USERS (ROL TECNICO / SUPERVISOR / ADMIN) ---');
    const [techs] = await pool.query(`
      SELECT u.id, u.email, u.nombre_completo, u.nivel_soporte, u.grupo_n2, u.is_active, r.nombre as rol
      FROM usuario u
      JOIN rol r ON u.rol_id = r.id
      WHERE r.nombre IN ('TECNICO', 'SUPERVISOR', 'ADMIN')
    `);
    console.log(JSON.stringify(techs, null, 2));

    console.log('--- USUARIO_EMPRESA ---');
    const [ue] = await pool.query(`
      SELECT ue.usuario_id, u.nombre_completo, u.nivel_soporte, ue.empresa_id, e.nombre as empresa_nombre
      FROM usuario_empresa ue
      JOIN usuario u ON ue.usuario_id = u.id
      JOIN empresa e ON ue.empresa_id = e.id
    `);
    console.log(JSON.stringify(ue, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('Error in check:', err);
    process.exit(1);
  }
}

check();
