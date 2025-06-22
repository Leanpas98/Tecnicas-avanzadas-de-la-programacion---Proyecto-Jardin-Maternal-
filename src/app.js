// app.js - servidor backend actualizado
const db = require('./db');
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');


const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
const session = require('express-session');

app.use(session({
  secret: 'clave_secreta_segura',
  resave: false,
  saveUninitialized: true
}));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Prueba de conexión a la base
app.get('/prueba-db', (req, res) => {
  db.query('SELECT 1 + 1 AS resultado', (err, results) => {
    if (err) return res.status(500).send('Error en la base de datos');
    res.send(`Resultado de la prueba: ${results[0].resultado}`);
  });
});

// Login
app.post('/login', async (req, res) => {
  const { usuario, contraseña } = req.body;
  if (!usuario || !contraseña) return res.status(400).json({ ok: false, message: 'Faltan datos' });

  const sql = `
    SELECT u.id_usuario, u.nombreUsuario, u.contraseña, u.estadoCuenta,
           CASE
             WHEN a.id_administrador IS NOT NULL THEN 'administrador'
             WHEN t.id_tutor IS NOT NULL THEN 'tutor'
             WHEN m.id_maestra IS NOT NULL THEN 'maestra'
             ELSE 'desconocido'
           END AS rol
    FROM usuario u
    LEFT JOIN administrador a ON u.id_usuario = a.id_usuario
    LEFT JOIN tutor t ON u.id_usuario = t.id_usuario
    LEFT JOIN maestra m ON u.id_usuario = m.id_usuario
    WHERE u.nombreUsuario = ?;
  `;

  db.query(sql, [usuario], async (err, results) => {
    if (err) return res.status(500).json({ ok: false, message: 'Error interno' });
    if (results.length === 0) return res.status(401).json({ ok: false, message: 'Usuario incorrecto' });

    const user = results[0];

    console.log("🟠 Usuario ingresado:", usuario);
    console.log("🔐 Contraseña ingresada:", contraseña);
    console.log("📦 Contraseña almacenada:", user.contraseña);

    try {
      const match = await bcrypt.compare(contraseña.trim(), user.contraseña.trim().replace(/\0/g, ''));

      console.log("✅ ¿Match con bcrypt?:", match);

      if (!match) return res.status(401).json({ ok: false, message: 'Contraseña incorrecta' });

      req.session.usuarioId = user.id_usuario;
      req.session.usuarioNombre = user.nombreUsuario;

      res.json({ ok: true, rol: user.rol, nombreUsuario: user.nombreUsuario, id_usuario: user.id_usuario });

    } catch (error) {
      console.error("❌ Error en bcrypt.compare:", error);
      return res.status(500).json({ ok: false, message: 'Error al validar la contraseña' });
    }
  });
});

app.post('/registro', async (req, res) => {
  const {
    nombre, apellido, usuario, email, contraseña, rol,
    dniTutor, domicilioTutor, telefonoTutor,
    dniMaestra, domicilioMaestra, telefonoMaestra, titulo
  } = req.body;

  if (!nombre || !apellido || !usuario || !email || !contraseña || !rol) {
    return res.status(400).json({ ok: false, message: 'Faltan datos obligatorios' });
  }

  try {
    // Validar si ya existe el nombre de usuario o email
    const validarSql = `SELECT * FROM USUARIO WHERE nombreUsuario = ? OR email = ?`;
    db.query(validarSql, [usuario, email], async (err, rows) => {
      if (err) {
        console.error('❌ Error al validar usuario:', err.message);
        return res.status(500).json({ ok: false, message: 'Error interno al validar' });
      }

      if (rows.length > 0) {
        return res.status(400).json({ ok: false, message: 'Usuario o correo ya registrados' });
      }

      const hash = await bcrypt.hash(contraseña, 10);

      // Insertar en tabla USUARIO
      const sqlUsuario = `
        INSERT INTO USUARIO (nombreUsuario, contraseña, estadoCuenta, nombreCompleto, email)
        VALUES (?, ?, 'Activo', ?, ?)
      `;

      db.query(sqlUsuario, [usuario, hash, `${nombre} ${apellido}`, email], (err, result) => {
        if (err) {
          console.error('❌ Error al crear usuario:', err.message);
          return res.status(500).json({ ok: false, message: 'Error al registrar usuario' });
        }

        const id_usuario = result.insertId;

        if (rol === 'tutor') {
          const dniNumerico = parseInt(dniTutor, 10);
          if (isNaN(dniNumerico)) {
            return res.status(400).json({ ok: false, message: 'DNI inválido' });
          }

          const sqlTutor = `
            INSERT INTO TUTOR (id_usuario, nombre, apellido, DNI, domicilio, telefono, mail)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;
          db.query(sqlTutor, [id_usuario, nombre, apellido, dniNumerico, domicilioTutor, telefonoTutor, email], (err2) => {
            if (err2) {
              console.error('❌ Error al insertar en TUTOR:', err2.message);
              return res.status(500).json({ ok: false, message: 'Error al registrar tutor' });
            }
            res.json({ ok: true, message: 'Tutor registrado exitosamente' });
          });

        } else if (rol === 'maestra') {
          const sqlMaestra = `
            INSERT INTO MAESTRA (id_usuario, nombre, apellido, DNI, domicilio, telefono, mail, titulo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          db.query(sqlMaestra, [id_usuario, nombre, apellido, dniMaestra, domicilioMaestra, telefonoMaestra, email, titulo], (err2) => {
            if (err2) {
              console.error('❌ Error al insertar en MAESTRA:', err2.message);
              return res.status(500).json({ ok: false, message: 'Error al registrar maestra' });
            }
            res.json({ ok: true, message: 'Maestra registrada exitosamente' });
          });

        } else if (rol === 'administrador') {
          const sqlAdmin = `
            INSERT INTO ADMINISTRADOR (id_usuario, nombre, apellido, mail)
            VALUES (?, ?, ?, ?)
          `;
          db.query(sqlAdmin, [id_usuario, nombre, apellido, email], (err2) => {
            if (err2) {
              console.error('❌ Error al insertar en ADMINISTRADOR:', err2.message);
              return res.status(500).json({ ok: false, message: 'Error al registrar administrador' });
            }
            res.json({ ok: true, message: 'Administrador registrado exitosamente' });
          });

        } else {
          return res.status(400).json({ ok: false, message: 'Rol no válido' });
        }
      });
    });

  } catch (error) {
    console.error('❌ Error general en el registro:', error.message);
    res.status(500).json({ ok: false, message: 'Error interno del servidor' });
  }
});

// API: Asistencia y salud - vista de maestra
app.get('/api/asistencia-salud-maestra', (req, res) => {
  const fecha = req.query.fecha;

  if (!fecha) {
    return res.status(400).json({ error: 'Fecha requerida' });
  }

  const sql = `
    SELECT 
      N.id_niño,
      N.nombre AS nombre_niño,
      N.apellido AS apellido_niño,
      N.grupo_sala,
      A.id_asistencia_y_salud,
      DATE_FORMAT(A.fecha, '%Y-%m-%d') AS fecha,
      A.presente AS estado_asistencia,
      A.higiene_personal,
      A.observacion_salud,
      A.recomendacion
    FROM NIÑO N
    LEFT JOIN ASISTENCIA_Y_SALUD A ON N.id_niño = A.id_niño AND A.fecha = ?
    ORDER BY N.apellido, N.nombre
  `;

  db.query(sql, [fecha], (err, results) => {
    if (err) {
      console.error('❌ Error en /api/asistencia-salud-maestra:', err);
      return res.status(500).json({ error: 'Error al consultar la base de datos' });
    }

    res.json(results);
  });
});

// API para vista Asistencia y Salud
app.get('/api/asistencia-salud', (req, res) => {
  const fecha = req.query.fecha;
  const usuarioId = req.session.usuarioId;

  if (!fecha || !usuarioId) {
    return res.status(400).json({ error: 'Falta la fecha o el usuario no está autenticado' });
  }

  const sql = `
    SELECT 
      N.id_niño,
      N.nombre AS nombre_niño,
      N.apellido AS apellido_niño,
      N.grupo_sala,
      A.id_asistencia_y_salud,
      DATE_FORMAT(A.fecha, '%Y-%m-%d') AS fecha,
      A.presente AS estado_asistencia,
      A.higiene_personal,
      A.observacion_salud,
      A.recomendacion
    FROM NIÑO N
    JOIN NIÑO_TUTOR NT ON N.id_niño = NT.id_niño
    LEFT JOIN ASISTENCIA_Y_SALUD A ON N.id_niño = A.id_niño AND A.fecha = ?
    WHERE NT.id_tutor = (SELECT id_tutor FROM TUTOR WHERE id_usuario = ?)
    ORDER BY N.apellido, N.nombre
  `;

  db.query(sql, [fecha, usuarioId], (err, results) => {
    if (err) {
      console.error('Error al obtener asistencia para tutor:', err);
      return res.status(500).json({ error: 'Error al consultar la base de datos' });
    }

    res.json(results);
  });
});

// Crear asistencia
app.post('/api/asistencia-salud', (req, res) => {
  const { id_niño, fecha, estado_asistencia, higiene_personal, observacion_salud, recomendacion } = req.body;
  if (!id_niño || !fecha) return res.status(400).json({ error: 'Faltan datos obligatorios' });

  const sql = `
    INSERT INTO ASISTENCIA_Y_SALUD (id_niño, fecha, presente, higiene_personal, observacion_salud, recomendacion)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [id_niño, fecha, estado_asistencia, higiene_personal, observacion_salud, recomendacion], (err) => {
    if (err) return res.status(500).json({ error: 'Error al guardar el nuevo registro' });
    res.json({ ok: true, message: 'Registro creado' });
  });
});

// Actualizar asistencia
app.put('/api/asistencia-salud/:id', (req, res) => {
  const id = req.params.id;
  const { estado_asistencia, higiene_personal, observacion_salud, recomendacion } = req.body;

  const sql = `
    UPDATE ASISTENCIA_Y_SALUD
    SET presente = ?, higiene_personal = ?, observacion_salud = ?, recomendacion = ?
    WHERE id_asistencia_y_salud = ?
  `;

  db.query(sql, [estado_asistencia, higiene_personal, observacion_salud, recomendacion, id], (err) => {
    if (err) return res.status(500).json({ error: 'Error al actualizar el registro' });
    res.json({ ok: true, message: 'Registro actualizado' });
  });
});

// API para vista Rutinas Diarias Maestra
app.get('/api/rutinas-diarias', (req, res) => {
  const fecha = req.query.fecha;

  if (!fecha) {
    return res.status(400).json({ error: 'Fecha requerida en la consulta' });
  }

  const sql = `
    SELECT 
      N.id_niño,
      N.nombre AS nombre_niño,
      N.apellido AS apellido_niño,
      N.grupo_sala,
      R.id_rutina_diaria,
      DATE_FORMAT(R.fecha, '%Y-%m-%d') AS fecha,
      R.alimentacion,
      R.sueño,
      R.actividades
    FROM NIÑO N
    LEFT JOIN RUTINA_DIARIA R
      ON N.id_niño = R.id_niño AND R.fecha = ?
    ORDER BY N.apellido, N.nombre
  `;

  db.query(sql, [fecha], (err, results) => {
    if (err) {
      console.error('❌ Error al obtener rutinas:', err);
      return res.status(500).json({ error: 'Error al consultar la base de datos' });
    }

    res.json(results);
  });
});

// API: Rutinas diarias del niño asignado al tutor logueado
app.get('/api/rutinas-diarias-tutor', (req, res) => {
  const fecha = req.query.fecha;
  const usuarioId = req.session.usuarioId;

  if (!fecha || !usuarioId) {
    return res.status(400).json({ error: 'Falta la fecha o el usuario no está autenticado' });
  }

  const sql = `
    SELECT 
      N.id_niño,
      N.nombre AS nombre_niño,
      N.apellido AS apellido_niño,
      N.grupo_sala,
      R.id_rutina_diaria,
      DATE_FORMAT(R.fecha, '%Y-%m-%d') AS fecha,
      R.alimentacion,
      R.sueño,
      R.actividades
    FROM NIÑO N
    JOIN NIÑO_TUTOR NT ON N.id_niño = NT.id_niño
    LEFT JOIN RUTINA_DIARIA R ON N.id_niño = R.id_niño AND R.fecha = ?
    WHERE NT.id_tutor = (SELECT id_tutor FROM TUTOR WHERE id_usuario = ?)
    ORDER BY N.apellido, N.nombre
  `;

  db.query(sql, [fecha, usuarioId], (err, results) => {
    if (err) {
      console.error('❌ Error al obtener rutina del tutor:', err);
      return res.status(500).json({ error: 'Error al consultar la base de datos' });
    }
    res.json(results);
  });
});


// === API para Chat de Maestra ===
// Obtener lista de usuarios para el selector (nombreUsuario y id)
app.get('/api/usuarios', (req, res) => {
  const sql = 'SELECT id_usuario, nombreUsuario FROM USUARIO';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error al obtener usuarios:', err);
      return res.status(500).json({ error: 'Error al consultar usuarios' });
    }
    res.json(results);
  });
});

// Obtener todos los mensajes entre emisor y receptor
app.get('/api/mensajes', (req, res) => {
  const { emisor, receptor } = req.query;

  if (!emisor || !receptor) {
    return res.status(400).json({ error: 'Faltan parámetros emisor o receptor' });
  }

  const sql = `
    SELECT id_mensaje, id_emisor, id_receptor, contenido, fecha
    FROM MENSAJE
    WHERE (id_emisor = ? AND id_receptor = ?)
       OR (id_emisor = ? AND id_receptor = ?)
    ORDER BY fecha ASC
  `;

  db.query(sql, [emisor, receptor, receptor, emisor], (err, results) => {
    if (err) {
      console.error('Error al obtener mensajes:', err);
      return res.status(500).json({ error: 'Error al consultar mensajes' });
    }
    res.json(results);
  });
});

// Insertar nuevo mensaje
app.post('/api/mensajes', (req, res) => {
  const { emisor, receptor, contenido } = req.body;

  if (!emisor || !receptor || !contenido || contenido.trim() === '') {
    return res.status(400).json({ error: 'Faltan datos obligatorios o el mensaje está vacío' });
  }

  const sql = `
    INSERT INTO MENSAJE (id_emisor, id_receptor, fecha, contenido)
    VALUES (?, ?, NOW(), ?)
  `;

  db.query(sql, [emisor, receptor, contenido], (err, result) => {
    if (err) {
      console.error('Error al enviar mensaje:', err);
      return res.status(500).json({ error: 'No se pudo enviar el mensaje' });
    }
    res.json({ ok: true, id_mensaje: result.insertId });
  });
});

// Obtener solo usuarios con los que hubo conversación (intercambio de mensajes)
app.get('/api/conversaciones/:miUsuarioId', (req, res) => {
  const miUsuarioId = req.params.miUsuarioId;

  const sql = `
    SELECT DISTINCT u.id_usuario, u.nombreUsuario
    FROM USUARIO u
    WHERE u.id_usuario IN (
      SELECT id_receptor FROM MENSAJE WHERE id_emisor = ?
      UNION
      SELECT id_emisor FROM MENSAJE WHERE id_receptor = ?
    )
  `;

  db.query(sql, [miUsuarioId, miUsuarioId], (err, results) => {
    if (err) {
      console.error("❌ Error al obtener conversaciones:", err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }
    res.json(results);
  });
});

app.get('/api/perfil', (req, res) => {
  const usuarioId = req.session.usuarioId;
  console.log('👤 ID desde sesión:', usuarioId);

  if (!usuarioId) return res.status(401).json({ error: 'No autenticado' });

  const sql = `
    SELECT u.nombreUsuario, u.estadoCuenta,
           m.nombre, m.apellido, m.mail, m.telefono, m.DNI, m.domicilio, m.titulo
    FROM USUARIO u
    JOIN MAESTRA m ON u.id_usuario = m.id_usuario
    WHERE u.id_usuario = ?
  `;

  db.query(sql, [usuarioId], (err, results) => {
    if (err) {
      console.error('❌ Error en la consulta SQL:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    if (results.length === 0) {
      console.warn('⚠️ No se encontró perfil para este usuario.');
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    res.json(results[0]);
  });
});

app.get('/api/perfil-tutor', (req, res) => {
  const usuarioId = req.session.usuarioId;
  if (!usuarioId) return res.status(401).json({ error: 'No autenticado' });

  const sql = `
    SELECT u.nombreUsuario, u.estadoCuenta,
           t.nombre, t.apellido, t.mail, t.telefono, t.DNI, t.domicilio
    FROM USUARIO u
    JOIN TUTOR t ON u.id_usuario = t.id_usuario
    WHERE u.id_usuario = ?
  `;

  db.query(sql, [usuarioId], (err, results) => {
    if (err) {
      console.error('❌ Error al obtener perfil del tutor:', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Perfil de tutor no encontrado' });
    }

    res.json(results[0]);
  });
});

app.put('/api/perfil-tutor', (req, res) => {
  const usuarioId = req.session.usuarioId;
  if (!usuarioId) return res.status(401).json({ error: 'No autenticado' });

  const { nombre, apellido, mail, telefono, domicilio } = req.body;

  const sql = `
    UPDATE TUTOR
    SET nombre = ?, apellido = ?, mail = ?, telefono = ?, domicilio = ?
    WHERE id_usuario = ?
  `;

  db.query(sql, [nombre, apellido, mail, telefono, domicilio, usuarioId], (err) => {
    if (err) {
      console.error('❌ Error al actualizar perfil del tutor:', err.message);
      return res.status(500).json({ error: 'Error al actualizar perfil del tutor' });
    }
    res.json({ ok: true, message: 'Perfil del tutor actualizado con éxito' });
  });
});


app.put('/api/perfil', (req, res) => {
  const usuarioId = req.session.usuarioId;
  if (!usuarioId) return res.status(401).json({ error: 'No autenticado' });

  const { nombre, apellido, mail, telefono, domicilio } = req.body;

  const sql = `
    UPDATE MAESTRA
    SET nombre = ?, apellido = ?, mail = ?, telefono = ?, domicilio = ?
    WHERE id_usuario = ?
  `;

  db.query(sql, [nombre, apellido, mail, telefono, domicilio, usuarioId], (err) => {
    if (err) {
      console.error('❌ Error al actualizar perfil:', err.message);
      return res.status(500).json({ error: 'Error al actualizar perfil' });
    }
    res.json({ ok: true, message: 'Perfil actualizado con éxito' });
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('❌ Error al cerrar sesión:', err);
      return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
    }
    res.clearCookie('connect.sid'); // opcional, limpia cookie
    res.json({ ok: true, message: 'Sesión cerrada' });
  });
});

app.get('/api/pagos-tutor', (req, res) => {
  const usuarioId = req.session.usuarioId;

  if (!usuarioId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const sql = `
    SELECT 
      P.id_pago,
      P.fecha_pago,
      P.fecha_vencimiento,
      P.monto,
      P.estado
    FROM PAGO P
    JOIN TUTOR T ON P.id_tutor = T.id_tutor
    WHERE T.id_usuario = ?
    ORDER BY P.fecha_vencimiento ASC
  `;

  db.query(sql, [usuarioId], (err, results) => {
    if (err) {
      console.error('❌ Error al obtener pagos del tutor:', err);
      return res.status(500).json({ error: 'Error al consultar pagos' });
    }
    res.json(results);
  });
});

// API para obtener nombre del tutor y nombre del niño asociado
app.get('/api/tutor-y-nino', (req, res) => {
  const usuarioId = req.session.usuarioId;

  if (!usuarioId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const sql = `
    SELECT 
      T.nombre AS nombre_tutor,
      T.apellido AS apellido_tutor,
      N.nombre AS nombre_niño,
      N.apellido AS apellido_niño
    FROM TUTOR T
    JOIN NIÑO_TUTOR NT ON T.id_tutor = NT.id_tutor
    JOIN NIÑO N ON NT.id_niño = N.id_niño
    WHERE T.id_usuario = ?
    LIMIT 1
  `;

  db.query(sql, [usuarioId], (err, results) => {
    if (err) {
      console.error('❌ Error al obtener datos del tutor:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'No se encontraron datos para este tutor' });
    }

    const { nombre_tutor, apellido_tutor, nombre_niño, apellido_niño } = results[0];

    res.json({
      nombreTutor: `${nombre_tutor} ${apellido_tutor}`,
      nombreNiño: `${nombre_niño} ${apellido_niño}`
    });
  });
});
//Ruta para crear una nueva rutina diaria Maestra
app.post('/api/rutinas-diarias', (req, res) => {
  const { id_niño, fecha, alimentacion, sueño, actividades } = req.body;

  if (!id_niño || !fecha) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  const sql = `
    INSERT INTO RUTINA_DIARIA (id_niño, fecha, alimentacion, sueño, actividades)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(sql, [id_niño, fecha, alimentacion, sueño, actividades], (err, result) => {
    if (err) {
      console.error('❌ Error al insertar rutina diaria:', err.message);
      return res.status(500).json({ error: 'Error al guardar rutina diaria' });
    }

    res.json({ ok: true, id_rutina_diaria: result.insertId });
  });
});

//Ruta para actualizar una rutina diaria existente
app.put('/api/rutinas-diarias/:id', (req, res) => {
  const id = req.params.id;
  const { alimentacion, sueño, actividades } = req.body;

  const sql = `
    UPDATE RUTINA_DIARIA
    SET alimentacion = ?, sueño = ?, actividades = ?
    WHERE id_rutina_diaria = ?
  `;

  db.query(sql, [alimentacion, sueño, actividades, id], (err) => {
    if (err) {
      console.error('❌ Error al actualizar rutina diaria:', err.message);
      return res.status(500).json({ error: 'Error al actualizar rutina diaria' });
    }

    res.json({ ok: true, message: 'Rutina diaria actualizada' });
  });
});


// Puerto del servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
