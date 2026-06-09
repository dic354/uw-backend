# UrbanWear — Backend API REST

API REST completa para la plataforma de comercio electrónico UrbanWear, una tienda online de moda urbana. Desarrollada con NestJS, Prisma ORM y MySQL.

**Repositorio:** `https://github.com/dic354/UW-backend`
**URL:** `https://uw-frontend.vercel.app/`
---

## Índice

- [Descripción general](#descripción-general)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Arquitectura del sistema](#arquitectura-del-sistema)
- [Requisitos previos](#requisitos-previos)
- [Instalación y configuración local](#instalación-y-configuración-local)
- [Esquema de base de datos](#esquema-de-base-de-datos)
- [Módulos y funcionalidades](#módulos-y-funcionalidades)
- [Referencia de endpoints](#referencia-de-endpoints)
- [Autenticación y autorización](#autenticación-y-autorización)
- [Validación de datos](#validación-de-datos)
- [Documentación Swagger](#documentación-swagger)
- [Docker](#docker)
- [Estructura de archivos](#estructura-de-archivos)
- [Autor](#autor)

---

## Descripción general

UrbanWear Backend es una API REST monolítica construida con NestJS que centraliza toda la lógica de negocio de la plataforma de comercio electrónico. Gestiona el catálogo de productos, la autenticación con roles basada en JWT, el carrito de compra, los pedidos con control de stock transaccional, los códigos de descuento, las reseñas de productos y la gestión del perfil de usuario.

La arquitectura sigue el patrón Cliente-Servidor donde el frontend Angular consume los endpoints de esta API mediante peticiones HTTP. Toda la comunicación entre módulos internos se realiza mediante inyección de dependencias gestionada por el contenedor IoC de NestJS. Cada módulo está autocontenido y sigue una separación estricta de responsabilidades entre controladores, servicios y objetos de transferencia de datos.

---

## Tecnologías utilizadas

| Tecnología | Versión | Propósito |
|---|---|---|
| NestJS | ^11.0 | Framework principal del backend con arquitectura modular |
| TypeScript | ^5.0 | Lenguaje de programación con tipado estático |
| Prisma ORM | ^6.0 | Capa de acceso a datos con tipado seguro y gestión del esquema |
| MySQL | 8.0 | Sistema gestor de base de datos relacional |
| JWT (JSON Web Token) | — | Tokens de autenticación sin estado |
| Passport.js | — | Middleware de autenticación y gestión de estrategias |
| bcrypt | — | Cifrado seguro de contraseñas con salt rounds |
| class-validator | — | Validación declarativa de DTOs mediante decoradores |
| class-transformer | — | Transformación de objetos y coerción de tipos |
| Swagger / OpenAPI | — | Documentación interactiva autogenerada de la API |
| Docker | — | Contenedores de MySQL y phpMyAdmin para desarrollo local |

---

## Arquitectura del sistema

### Arquitectura de alto nivel

```
                        INTERNET
                            |
                   [Proxy inverso NGINX]
                   Terminación SSL (443)
                            |
              +-------------+-------------+
              |                           |
      [Frontend Angular]        [Backend API NestJS]
      HTML/CSS/JS estático       Puerto 3000 (interno)
      Servido por NGINX           Gestionado por PM2
                                          |
                                  [Base de datos MySQL 8.0]
                                  Puerto 3306 (interno)
                                  Capa ORM Prisma
```

### Arquitectura interna de módulos

```
Petición HTTP
      |
      v
main.ts
  ValidationPipe (global) ← valida todos los cuerpos de petición
  Configuración CORS
  Configuración Swagger
      |
      v
AppModule (raíz)
  PrismaModule (@Global)  ← conexión a BD disponible en toda la app
  AuthModule
  CategoriasModule
  ProductosModule
  CarritoModule
  PedidosModule
  DescuentosModule
  ResenasModule
  UsuariosModule
  ProductoImagenModule
      |
      v
[Controlador] ← gestiona el enrutamiento HTTP, extrae parámetros
      |
      v
[Guard] ← JwtAuthGuard + RolesGuard (si está protegido)
      |
      v
[Servicio] ← toda la lógica de negocio vive aquí
      |
      v
[PrismaService] ← ejecuta consultas tipadas contra MySQL
      |
      v
Base de datos MySQL
```

### Ciclo de vida de una petición en detalle

Cada petición HTTP pasa por las siguientes capas en orden:

**1. ValidationPipe (global)**
Configurado en `main.ts` con `whitelist: true`, `forbidNonWhitelisted: true` y `transform: true`. Este pipe intercepta el cuerpo de la petición antes de llegar al controlador, lo valida contra el esquema del DTO usando los decoradores de class-validator y elimina automáticamente cualquier campo no declarado en el DTO. Si la validación falla, devuelve `400 Bad Request` con mensajes de error detallados antes de que se ejecute ninguna lógica de negocio.

**2. JwtAuthGuard**
Se aplica a nivel de controlador o de método usando `@UseGuards(JwtAuthGuard)`. Cuando está activo, intercepta la petición y lee la cabecera `Authorization: Bearer <token>`. Delega en `JwtStrategy` que verifica la firma del token usando `JWT_SECRET`, comprueba la expiración y busca el usuario en la base de datos. Si es válido, adjunta el objeto de usuario completo a `req.user`. Si el token falta, es inválido o ha expirado, devuelve `401 Unauthorized` y la petición nunca llega al controlador.

**3. RolesGuard**
Se aplica junto a `JwtAuthGuard` usando `@UseGuards(JwtAuthGuard, RolesGuard)` y `@Roles('administrador')`. Lee los metadatos establecidos por el decorador `@Roles()` y compara el rol requerido con `req.user.rol`. Si el usuario no tiene el rol requerido, devuelve `403 Forbidden`. Este guard siempre se ejecuta después de `JwtAuthGuard` porque depende de que `req.user` esté disponible.

**4. Controlador**
Recibe la petición validada. Extrae parámetros de URL con `@Param()`, parámetros de consulta con `@Query()`, el cuerpo de la petición con `@Body()` y el usuario autenticado con `@Request()`. El controlador no contiene lógica de negocio y delega inmediatamente al servicio.

**5. Servicio**
Contiene toda la lógica de negocio. Valida las reglas de negocio (comprobar si un producto tiene stock, si un email ya existe), ejecuta consultas Prisma y lanza las excepciones HTTP apropiadas (`NotFoundException`, `ConflictException`, `BadRequestException`, `ForbiddenException`) que NestJS convierte automáticamente a los códigos de estado HTTP correctos.

**6. PrismaService**
Extiende `PrismaClient` y gestiona el ciclo de vida de la conexión MySQL. Se abre en `onModuleInit` y se cierra en `onModuleDestroy`. Como `PrismaModule` está decorado con `@Global()`, `PrismaService` está disponible en todos los módulos sin importaciones explícitas.

### Cómo se conectan los módulos entre sí

```
PrismaModule (@Global)
    └── PrismaService
            ↑ inyectado en cada servicio mediante constructor
            |
    ┌───────+────────┬──────────────┬────────────┐
AuthService  ProductosService  PedidosService  ...etc
    |               |               |
AuthController  ProductosCtrl  PedidosCtrl
```

`AuthModule` exporta `JwtModule` para que otros módulos puedan verificar tokens si es necesario. `PrismaModule` exporta `PrismaService` globalmente. El resto de módulos están autocontenidos y no se importan entre sí, lo que mantiene el acoplamiento bajo y el código mantenible.

---

## Requisitos previos

- Node.js v18 o superior
- npm v9 o superior
- Docker Desktop instalado y en ejecución
- NestJS CLI: `npm install -g @nestjs/cli`

---

## Esquema de base de datos

El esquema completo está definido en `prisma/schema.prisma`. A continuación se describe cada entidad, sus campos y las relaciones entre ellas.

### Entidad: Usuario

Almacena tanto clientes como administradores. El campo `rol` controla lo que cada usuario puede hacer.

```
id              INT           Clave primaria, autoincremento
nombre          VARCHAR(100)  Nombre completo, obligatorio
email           VARCHAR(150)  Correo electrónico único, obligatorio
contrasenaHash  VARCHAR(255)  Hash bcrypt de la contraseña, nunca en texto plano
telefono        VARCHAR(20)   Teléfono opcional
direccion       TEXT          Dirección de envío opcional
ciudad          VARCHAR(100)  Ciudad opcional
codigoPostal    VARCHAR(10)   Código postal opcional
rol             ENUM          'cliente' (por defecto) o 'administrador'
fechaRegistro   TIMESTAMP     Establecido automáticamente al crear
```

### Entidad: Categoria

Categorías de productos para organizar el catálogo.

```
id              INT           Clave primaria, autoincremento
nombre          VARCHAR(100)  Nombre único de la categoría, obligatorio
descripcion     TEXT          Descripción opcional
imagenCategoria VARCHAR(255)  URL de imagen de categoría opcional
```

### Entidad: Producto

El catálogo principal de productos. Los productos nunca se eliminan físicamente; se desactivan usando el flag `activo` para preservar la integridad del historial de pedidos.

```
id            INT           Clave primaria, autoincremento
nombre        VARCHAR(200)  Nombre del producto, obligatorio
descripcion   TEXT          Descripción detallada opcional
precio        DECIMAL(10,2) Precio con dos decimales, obligatorio
categoriaId   INT           Clave foránea a Categoria
stock         INT           Unidades disponibles, por defecto 0
talla         ENUM          XS, S, M, L, XL, XXL (opcional)
color         VARCHAR(50)   Descripción de color opcional
imagenUrl     VARCHAR(255)  URL de la imagen principal del producto
activo        BOOLEAN       Si el producto es visible, por defecto true
fechaCreacion TIMESTAMP     Establecido automáticamente al crear
```

### Entidad: ProductoImagen

Imágenes adicionales de un producto, ordenadas por el campo `orden`.

```
id         INT          Clave primaria, autoincremento
productoId INT          Clave foránea a Producto
url        VARCHAR(255) URL de la imagen, obligatorio
orden      INT          Orden de visualización, por defecto 0
```

### Entidad: Pedido

Una orden de compra confirmada creada desde el carrito del usuario. Contiene datos de envío, método de pago y estado actual.

```
id                 INT           Clave primaria, autoincremento
usuarioId          INT           Clave foránea a Usuario
fechaPedido        TIMESTAMP     Establecido automáticamente al crear
estado             ENUM          pendiente, procesando, enviado, entregado, cancelado
total              DECIMAL(10,2) Total final del pedido tras descuentos
direccionEnvio     TEXT          Dirección de envío, obligatorio
ciudadEnvio        VARCHAR(100)  Ciudad de envío, obligatorio
codigoPostalEnvio  VARCHAR(10)   Código postal de envío, obligatorio
metodoPago         ENUM          tarjeta, paypal, transferencia
fechaEnvio         TIMESTAMP     Se establece automáticamente al cambiar a 'enviado'
descuentoId        INT           Clave foránea opcional a Descuento
pagoReferencia     VARCHAR(255)  ID de transacción de Stripe o PayPal opcional
```

### Entidad: DetallePedido

Líneas de producto de cada pedido. Se crean automáticamente como parte de la transacción de creación del pedido. Nunca se gestionan directamente a través de la API.

```
id             INT           Clave primaria, autoincremento
pedidoId       INT           Clave foránea a Pedido
productoId     INT           Clave foránea a Producto
cantidad       INT           Número de unidades pedidas
precioUnitario DECIMAL(10,2) Precio en el momento de la compra (instantánea)
subtotal       DECIMAL(10,2) cantidad * precioUnitario
```

### Entidad: Carrito

Items temporales del carrito de compra. Cada combinación usuario-producto es única (forzada por `@@unique([usuarioId, productoId])`). El carrito completo se elimina cuando se crea un pedido exitosamente.

```
id            INT       Clave primaria, autoincremento
usuarioId     INT       Clave foránea a Usuario
productoId    INT       Clave foránea a Producto
cantidad      INT       Número de unidades, por defecto 1
fechaAgregado TIMESTAMP Establecido automáticamente al añadir
```

### Entidad: Descuento

Códigos de descuento que se pueden aplicar a los pedidos. Registra el contador de usos contra un máximo opcional.

```
id           INT           Clave primaria, autoincremento
codigo       VARCHAR(50)   Código de descuento único
porcentaje   DECIMAL(5,2)  Porcentaje de descuento (1-100)
fechaInicio  DATETIME      Inicio del período de validez
fechaFin     DATETIME      Fin del período de validez
activo       BOOLEAN       Si el código puede usarse, por defecto true
usosMaximos  INT           Número máximo de usos opcional
usosActuales INT           Veces que se ha usado, por defecto 0
```

### Entidad: Resena

Reseñas de productos vinculadas a usuarios. Un usuario solo puede reseñar un producto una vez (`@@unique([usuarioId, productoId])`). El sistema verifica que el usuario tiene un pedido entregado o enviado que contiene el producto antes de permitir la reseña.

```
id          INT       Clave primaria, autoincremento
usuarioId   INT       Clave foránea a Usuario
productoId  INT       Clave foránea a Producto
puntuacion  INT       Valoración de 1 a 5 estrellas
comentario  TEXT      Comentario escrito opcional
fechaResena TIMESTAMP Establecido automáticamente al crear
```

### Relaciones entre entidades

```
Categoria   (1) ──── (N) Producto
Producto    (1) ──── (N) ProductoImagen
Producto    (1) ──── (N) DetallePedido
Producto    (1) ──── (N) Carrito
Producto    (1) ──── (N) Resena
Usuario     (1) ──── (N) Pedido
Usuario     (1) ──── (N) Carrito
Usuario     (1) ──── (N) Resena
Pedido      (1) ──── (N) DetallePedido
Descuento   (1) ──── (N) Pedido
```

---

## Módulos y funcionalidades

### PrismaModule

**Ubicación:** `src/prisma/`
**Tipo:** Módulo global (`@Global()`)

Proporciona `PrismaService` a toda la aplicación sin necesidad de importarlo en cada módulo. `PrismaService` extiende `PrismaClient` e implementa `OnModuleInit` y `OnModuleDestroy` para gestionar automáticamente el ciclo de vida de la conexión a la base de datos.

```typescript
// Cómo se usa en cualquier servicio
@Injectable()
export class ProductosService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.producto.findMany();
  }
}
```

---

### AuthModule

**Ubicación:** `src/auth/`
**Endpoints públicos:** `POST /auth/register`, `POST /auth/login`

Gestiona el registro y la autenticación de usuarios. Usa `bcrypt` con 10 salt rounds para el cifrado de contraseñas. Genera tokens JWT con expiración de 7 días que contienen el `id`, `email` y `rol` del usuario en el payload.

**Flujo de registro:**
1. Validar el `RegisterDto` entrante (formato de email, longitud mínima de contraseña)
2. Comprobar si el email ya existe en la base de datos
3. Hashear la contraseña con bcrypt
4. Crear el registro de usuario con rol `cliente` por defecto
5. Devolver el objeto de usuario excluyendo `contrasenaHash`

**Flujo de login:**
1. Validar el `LoginDto` entrante
2. Buscar el usuario por email
3. Comparar la contraseña proporcionada con el hash almacenado usando `bcrypt.compare`
4. Si es válida, generar un token JWT firmado con `JWT_SECRET`
5. Devolver el token e información básica del usuario

**DTOs:**

`RegisterDto`:
```
nombre        string   Obligatorio, mínimo 2 caracteres
email         string   Obligatorio, debe ser formato de email válido
contrasena    string   Obligatorio, mínimo 8 caracteres
telefono      string   Opcional
direccion     string   Opcional
ciudad        string   Opcional
codigoPostal  string   Opcional
```

`LoginDto`:
```
email      string   Obligatorio, debe ser formato de email válido
contrasena string   Obligatorio
```

**JwtStrategy:**
Se ejecuta en cada petición a un endpoint protegido. Extrae el token de la cabecera `Authorization: Bearer`, verifica su firma y expiración, luego busca el usuario completo en la base de datos para confirmar que sigue existiendo. Devuelve el objeto de usuario que NestJS adjunta a `req.user`.

**JwtAuthGuard:**
Un envoltorio fino sobre `AuthGuard('jwt')` que activa `JwtStrategy`. Se aplica usando `@UseGuards(JwtAuthGuard)`.

---

### CategoriasModule

**Ubicación:** `src/categorias/`
**Endpoints públicos:** `GET /categorias`, `GET /categorias/:id`
**Endpoints de administrador:** `POST /categorias`, `PUT /categorias/:id`, `DELETE /categorias/:id`

Gestiona la jerarquía de categorías de productos. Las operaciones de lectura son públicas para que el escaparate pueda mostrar categorías sin autenticación. Las operaciones de escritura están restringidas a administradores.

**Métodos del servicio:**

`findAll()` — Devuelve todas las categorías con un recuento de sus productos asociados. Ordenadas alfabéticamente por nombre.

`findOne(id)` — Devuelve una categoría individual incluyendo todos sus productos activos con campos seleccionados (id, nombre, precio, imagenUrl, stock, talla, color). Lanza `NotFoundException` si la categoría no existe.

`create(dto)` — Crea una nueva categoría. Comprueba la unicidad del nombre antes de insertar. Lanza `ConflictException` si el nombre ya existe.

`update(id, dto)` — Actualiza campos de la categoría. Verifica primero que la categoría existe. Si se proporciona un nuevo nombre, comprueba que no está siendo usado por otra categoría.

`remove(id)` — Elimina una categoría. Antes de eliminar, cuenta los productos asociados. Lanza `ConflictException` si hay productos vinculados a esta categoría, evitando productos huérfanos.

**DTOs:**

`CreateCategoriaDto`:
```
nombre          string   Obligatorio, mínimo 2 caracteres
descripcion     string   Opcional
imagenCategoria string   URL opcional
```

`UpdateCategoriaDto`:
```
nombre          string   Opcional, mínimo 2 caracteres
descripcion     string   Opcional
imagenCategoria string   URL opcional
```

---

### ProductosModule

**Ubicación:** `src/productos/`
**Endpoints públicos:** `GET /productos`, `GET /productos/:id`
**Endpoints de administrador:** `POST /productos`, `PUT /productos/:id`, `DELETE /productos/:id`

El módulo principal del catálogo. Soporta filtrado rico, paginación y eliminación lógica.

**Métodos del servicio:**

`findAll(filtros)` — Construye una cláusula `where` dinámica de Prisma basada en los filtros proporcionados en la cadena de consulta. Soporta búsqueda parcial de texto en `nombre` y `color` usando `contains`. Soporta filtrado por rango de precios usando `gte` (mayor o igual) y `lte` (menor o igual). Ejecuta dos consultas en paralelo usando `Promise.all`: una para los datos paginados y otra para el total. Devuelve una respuesta estructurada con `datos`, `total`, `pagina`, `limite` y `totalPaginas`.

`findOne(id)` — Devuelve un producto individual con su categoría completa, imágenes ordenadas y reseñas incluyendo nombres de los autores. Lanza `NotFoundException` si no se encuentra.

`create(dto)` — Valida que el `categoriaId` referenciado existe antes de crear el producto. Devuelve el producto creado con su categoría.

`update(id, dto)` — Valida que tanto el producto como la nueva categoría (si se cambia) existen antes de actualizar.

`remove(id)` — Establece `activo = false` en lugar de eliminar. Esto preserva la referencia al producto en los registros de `DetallePedido` de pedidos anteriores. El producto desaparece del listado público pero sus datos permanecen intactos.

**Filtros disponibles para `GET /productos`:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `nombre` | string | Búsqueda parcial sin distinción de mayúsculas en el nombre |
| `categoriaId` | number | Filtrar por ID exacto de categoría |
| `precioMin` | number | Precio mínimo inclusivo |
| `precioMax` | number | Precio máximo inclusivo |
| `talla` | string | Coincidencia exacta: XS, S, M, L, XL, XXL |
| `color` | string | Búsqueda parcial sin distinción de mayúsculas en el color |
| `pagina` | number | Número de página, por defecto 1 |
| `limite` | number | Elementos por página, por defecto 12 |

**DTOs:**

`CreateProductoDto`:
```
nombre      string   Obligatorio, mínimo 2 caracteres
descripcion string   Opcional
precio      number   Obligatorio, mínimo 0
categoriaId number   Obligatorio, entero positivo
stock       number   Obligatorio, mínimo 0
talla       enum     Opcional: XS | S | M | L | XL | XXL
color       string   Opcional
imagenUrl   string   URL opcional
activo      boolean  Opcional, por defecto true
```

`UpdateProductoDto` — Mismos campos que `CreateProductoDto` pero todos opcionales.

`FiltroProductoDto` — Todos los campos opcionales para filtrado por cadena de consulta más `pagina` y `limite`.

---

### CarritoModule

**Ubicación:** `src/carrito/`
**Todos los endpoints requieren autenticación:** Sí (JwtAuthGuard a nivel de controlador)

Gestiona el carrito de compra por usuario. Todas las operaciones están limitadas al usuario autenticado mediante `req.user.id`, evitando que los usuarios accedan o modifiquen los carritos de otros.

**Métodos del servicio:**

`findByUsuario(usuarioId)` — Obtiene todos los items del carrito del usuario con detalles del producto. Calcula el total del carrito reduciendo sobre todos los items multiplicando cantidad por precio. Devuelve `{ items, total, totalItems }`.

`addItem(usuarioId, dto)` — Primero valida que el producto existe y está activo. Luego comprueba el stock disponible contra la cantidad solicitada. Usa `upsert` de Prisma con la clave única compuesta `[usuarioId, productoId]`: si el item ya existe incrementa la cantidad, si no crea un nuevo registro. Esto evita entradas duplicadas en el carrito para el mismo producto.

`updateItem(id, usuarioId, dto)` — Valida que el item del carrito existe y pertenece al usuario solicitante usando `findFirst` con ambos `id` y `usuarioId`. Valida la nueva cantidad contra el stock disponible antes de actualizar.

`removeItem(id, usuarioId)` — Misma validación de propiedad que `updateItem`. Elimina el item del carrito.

`clearCarrito(usuarioId)` — Elimina todos los items del carrito del usuario usando `deleteMany`.

**DTOs:**

`AddCarritoDto`:
```
productoId  number   Obligatorio, entero positivo
cantidad    number   Obligatorio, mínimo 1
```

`UpdateCarritoDto`:
```
cantidad    number   Obligatorio, mínimo 1
```

---

### PedidosModule

**Ubicación:** `src/pedidos/`
**Endpoints de usuario:** `POST /pedidos`, `GET /pedidos/mis-pedidos`, `GET /pedidos/:id`
**Endpoints de administrador:** `GET /pedidos`, `PUT /pedidos/:id/estado`

El módulo más complejo. Crea pedidos desde el contenido del carrito usando una transacción de base de datos para garantizar la consistencia de los datos.

**Transacción de creación de pedido (`$transaction`):**

Todo el proceso de creación del pedido está envuelto en una transacción interactiva de Prisma. Si cualquier paso falla, todos los cambios se revierten automáticamente:

1. Obtener todos los items del carrito del usuario con datos de producto
2. Validar que el carrito no está vacío — lanzar `BadRequestException` si está vacío
3. Para cada producto: validar que está activo y tiene stock suficiente — lanzar `BadRequestException` con nombre del producto y stock disponible si no
4. Calcular el subtotal sumando `precio * cantidad` para todos los items
5. Si se proporciona `codigoDescuento`: buscar el descuento, validar que está activo, comprobar validez de fecha, comprobar contador de usos contra el máximo — lanzar `BadRequestException` con razón específica si alguna comprobación falla. Aplicar la reducción porcentual al total.
6. Iniciar `$transaction`:
   - Crear registro `Pedido` con todos los datos de envío y pago
   - Crear todos los registros `DetallePedido` (uno por item del carrito) con instantánea del precio
   - Para cada producto: decrementar el stock usando `decrement` de Prisma
   - Si se aplicó un descuento: incrementar `usosActuales` usando `increment`
   - Eliminar todos los items del carrito del usuario usando `deleteMany`
7. Devolver el pedido completado con todas sus líneas de detalle

**Métodos del servicio:**

`findByUsuario(usuarioId)` — Devuelve todos los pedidos del usuario autenticado, ordenados por fecha descendente, incluyendo líneas de pedido con miniaturas de productos.

`findOne(id, usuarioId, esAdmin)` — Devuelve el detalle completo del pedido. Si el usuario solicitante no es administrador, verifica que `pedido.usuarioId === usuarioId` para evitar acceso a pedidos de otros usuarios. Lanza `ForbiddenException` si la comprobación de propiedad falla.

`findAll()` — Solo administrador. Devuelve todos los pedidos con información del usuario y líneas de pedido.

`updateEstado(id, dto)` — Solo administrador. Actualiza el estado del pedido. Establece automáticamente `fechaEnvio` con la marca de tiempo actual cuando el estado cambia a `enviado`.

**DTOs:**

`CreatePedidoDto`:
```
direccionEnvio     string   Obligatorio, mínimo 5 caracteres
ciudadEnvio        string   Obligatorio, mínimo 2 caracteres
codigoPostalEnvio  string   Obligatorio, mínimo 4 caracteres
metodoPago         enum     Obligatorio: tarjeta | paypal | transferencia
codigoDescuento    string   Código de descuento opcional
```

`UpdateEstadoDto`:
```
estado   enum   Obligatorio: pendiente | procesando | enviado | entregado | cancelado
```

---

### DescuentosModule

**Ubicación:** `src/descuentos/`
**Endpoints de usuario:** `POST /descuentos/validar` (requiere JWT)
**Endpoints de administrador:** `GET /descuentos`, `GET /descuentos/:id`, `POST /descuentos`, `PUT /descuentos/:id`, `DELETE /descuentos/:id`

Gestiona los códigos de descuento. El endpoint de validación existe para que el frontend pueda comprobar un código antes de que el usuario envíe el pedido, proporcionando retroalimentación inmediata sin efectos secundarios.

**Métodos del servicio:**

`findAll()` — Devuelve todos los descuentos con un recuento de pedidos que usaron cada uno.

`findOne(id)` — Devuelve un descuento individual o lanza `NotFoundException`.

`create(dto)` — Valida la unicidad del código. Valida que `fechaFin` sea posterior a `fechaInicio`. Crea el descuento convirtiendo las cadenas de fecha a objetos `Date`.

`update(id, dto)` — Valida la existencia. Valida la unicidad del nuevo código si se proporciona. Convierte cadenas de fecha a objetos `Date` antes de actualizar.

`remove(id)` — Elimina físicamente el registro de descuento.

`validar(dto)` — Valida un código sin aplicarlo ni modificar nada. Comprueba: el código existe y está activo, la fecha actual está dentro del rango de validez, el contador de usos está por debajo del máximo. Devuelve `{ valido: true, porcentaje, codigo }` si tiene éxito. La aplicación real del descuento ocurre en `PedidosService.create`.

**DTOs:**

`CreateDescuentoDto`:
```
codigo       string   Obligatorio, mínimo 3 caracteres, debe ser único
porcentaje   number   Obligatorio, entre 1 y 100
fechaInicio  string   Obligatorio, formato de fecha ISO "YYYY-MM-DD"
fechaFin     string   Obligatorio, formato de fecha ISO "YYYY-MM-DD"
activo       boolean  Opcional, por defecto true
usosMaximos  number   Entero positivo opcional
```

`UpdateDescuentoDto` — Mismos campos, todos opcionales.

`ValidarDescuentoDto`:
```
codigo   string   Obligatorio
```

---

### ResenasModule

**Ubicación:** `src/resenas/`
**Endpoints públicos:** `GET /resenas/producto/:id`
**Endpoints de usuario:** `POST /resenas`, `PUT /resenas/:id`, `DELETE /resenas/:id`

Gestiona las reseñas de productos. Fuerza que los usuarios solo puedan reseñar productos que hayan comprado realmente, evitando reseñas fraudulentas.

**Métodos del servicio:**

`findByProducto(productoId)` — Valida que el producto existe. Devuelve todas las reseñas con nombres de los autores. Calcula y devuelve la valoración media de todas las reseñas como `mediaPuntuacion` redondeada a un decimal.

`create(usuarioId, dto)` — Realiza tres comprobaciones antes de crear:
1. El producto existe y está activo
2. El usuario tiene un `Pedido` en estado `enviado` o `entregado` que contiene el producto (usando `detallePedido` con filtro anidado de `pedido`)
3. El usuario no ha reseñado ya este producto (comprobación única compuesta `[usuarioId, productoId]`)

`update(id, usuarioId, dto)` — Obtiene la reseña, verifica que `resena.usuarioId === usuarioId`. Lanza `ForbiddenException` si el usuario solicitante no es el autor.

`remove(id, usuarioId, esAdmin)` — Misma comprobación de propiedad. Los administradores pueden eliminar cualquier reseña independientemente del autor.

**DTOs:**

`CreateResenaDto`:
```
productoId  number   Obligatorio, entero positivo
puntuacion  number   Obligatorio, entero entre 1 y 5
comentario  string   Opcional
```

`UpdateResenaDto`:
```
puntuacion  number   Opcional, entero entre 1 y 5
comentario  string   Opcional
```

---

### UsuariosModule

**Ubicación:** `src/usuarios/`
**Todos los endpoints requieren autenticación**
**Endpoints de usuario:** `GET /usuarios/me`, `PUT /usuarios/me`, `PUT /usuarios/me/password`
**Endpoints de administrador:** `GET /usuarios`, `GET /usuarios/:id`

Gestión del perfil para usuarios autenticados. Los administradores pueden ver todos los usuarios y su historial de pedidos.

**Métodos del servicio:**

`findMe(id)` — Devuelve el perfil del usuario autenticado usando `select` para excluir explícitamente `contrasenaHash` de la respuesta.

`updateMe(id, dto)` — Si se proporciona un nuevo email, comprueba que no está siendo usado por otra cuenta. Actualiza y devuelve el perfil actualizado excluyendo `contrasenaHash`.

`changePassword(id, dto)` — Obtiene el usuario para conseguir `contrasenaHash`. Verifica `contrasenaActual` contra el hash usando `bcrypt.compare`. Si es correcta, genera un nuevo hash para `contrasenaNueva` y actualiza el registro. Devuelve un mensaje de éxito.

`findAll()` — Solo administrador. Devuelve todos los usuarios con recuento de pedidos usando `_count`. No incluye `contrasenaHash` en ningún registro.

`findOne(id)` — Solo administrador. Devuelve el perfil completo del usuario incluyendo su historial completo de pedidos ordenado por fecha descendente.

**DTOs:**

`UpdateUsuarioDto`:
```
nombre       string   Opcional
email        string   Opcional, debe ser formato de email válido
telefono     string   Opcional
direccion    string   Opcional
ciudad       string   Opcional
codigoPostal string   Opcional
```

`ChangePasswordDto`:
```
contrasenaActual  string   Obligatorio
contrasenaNueva   string   Obligatorio, mínimo 8 caracteres
```

---

### ProductoImagenModule

**Ubicación:** `src/producto-imagen/`
**Endpoints públicos:** `GET /producto-imagen/producto/:id`
**Endpoints de administrador:** `POST /producto-imagen`, `PUT /producto-imagen/:id`, `DELETE /producto-imagen/:id`

Gestiona imágenes adicionales de productos más allá del `imagenUrl` principal. Las imágenes se ordenan por el campo `orden` para una visualización consistente.

**Métodos del servicio:**

`findByProducto(productoId)` — Valida que el producto existe. Devuelve todas las imágenes ordenadas por `orden` ascendente.

`create(dto)` — Valida que el producto existe antes de crear el registro de imagen.

`update(id, dto)` — Valida que el registro de imagen existe antes de actualizar.

`remove(id)` — Valida que el registro de imagen existe. Elimina físicamente el registro.

**DTOs:**

`CreateImagenDto`:
```
productoId  number   Obligatorio, entero positivo
url         string   Obligatorio
orden       number   Opcional, mínimo 0, por defecto 0
```

`UpdateImagenDto`:
```
url    string   Opcional
orden  number   Opcional, mínimo 0
```

---

### Common (utilidades compartidas)

**Ubicación:** `src/common/`

Contiene decoradores y guards compartidos entre múltiples módulos.

**`roles.decorator.ts`** — Define el decorador `@Roles()` usando `SetMetadata` con la clave `'roles'`. Se usa para adjuntar metadatos de rol requerido a los métodos del controlador.

**`roles.guard.ts`** — Implementa `CanActivate`. Usa `Reflector` para leer los metadatos establecidos por `@Roles()` del handler y clase actual. Accede a `req.user.rol` (poblado por `JwtAuthGuard`) y devuelve `true` si el rol coincide, `false` (resultando en `403`) si no. Si no hay decorador `@Roles()` presente, el guard permite pasar la petición.

---

## Referencia de endpoints

### Auth

| Método | Endpoint | Cuerpo | Respuesta | Acceso |
|---|---|---|---|---|
| POST | `/auth/register` | RegisterDto | Objeto usuario (sin hash) | Público |
| POST | `/auth/login` | LoginDto | `{ access_token, usuario }` | Público |

### Categorias

| Método | Endpoint | Cuerpo / Parámetros | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/categorias` | — | Array de categorías con recuento de productos | Público |
| GET | `/categorias/:id` | id | Categoría con productos activos | Público |
| POST | `/categorias` | CreateCategoriaDto | Categoría creada | Admin |
| PUT | `/categorias/:id` | id + UpdateCategoriaDto | Categoría actualizada | Admin |
| DELETE | `/categorias/:id` | id | Categoría eliminada | Admin |

### Productos

| Método | Endpoint | Cuerpo / Parámetros | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/productos` | Query: FiltroProductoDto | `{ datos, total, pagina, limite, totalPaginas }` | Público |
| GET | `/productos/:id` | id | Producto con categoría, imágenes y reseñas | Público |
| POST | `/productos` | CreateProductoDto | Producto creado con categoría | Admin |
| PUT | `/productos/:id` | id + UpdateProductoDto | Producto actualizado con categoría | Admin |
| DELETE | `/productos/:id` | id | Producto con `activo: false` | Admin |

### Carrito

| Método | Endpoint | Cuerpo / Parámetros | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/carrito` | — | `{ items, total, totalItems }` | Usuario |
| POST | `/carrito` | AddCarritoDto | Item creado o actualizado | Usuario |
| PUT | `/carrito/:id` | id + UpdateCarritoDto | Item del carrito actualizado | Usuario |
| DELETE | `/carrito/:id` | id | `{ message }` | Usuario |
| DELETE | `/carrito` | — | `{ message }` | Usuario |

### Pedidos

| Método | Endpoint | Cuerpo / Parámetros | Respuesta | Acceso |
|---|---|---|---|---|
| POST | `/pedidos` | CreatePedidoDto | Pedido completo con detalles | Usuario |
| GET | `/pedidos/mis-pedidos` | — | Array de pedidos del usuario | Usuario |
| GET | `/pedidos/:id` | id | Detalle completo del pedido | Usuario o Admin |
| GET | `/pedidos` | — | Todos los pedidos con info del usuario | Admin |
| PUT | `/pedidos/:id/estado` | id + UpdateEstadoDto | Pedido actualizado | Admin |

### Descuentos

| Método | Endpoint | Cuerpo / Parámetros | Respuesta | Acceso |
|---|---|---|---|---|
| POST | `/descuentos/validar` | ValidarDescuentoDto | `{ valido, porcentaje, codigo }` | Usuario |
| GET | `/descuentos` | — | Array de descuentos con recuento de usos | Admin |
| GET | `/descuentos/:id` | id | Descuento individual | Admin |
| POST | `/descuentos` | CreateDescuentoDto | Descuento creado | Admin |
| PUT | `/descuentos/:id` | id + UpdateDescuentoDto | Descuento actualizado | Admin |
| DELETE | `/descuentos/:id` | id | Descuento eliminado | Admin |

### Resenas

| Método | Endpoint | Cuerpo / Parámetros | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/resenas/producto/:id` | id | `{ resenas, totalResenas, mediaPuntuacion }` | Público |
| POST | `/resenas` | CreateResenaDto | Reseña creada con info del usuario | Usuario (que haya comprado) |
| PUT | `/resenas/:id` | id + UpdateResenaDto | Reseña actualizada | Solo el autor |
| DELETE | `/resenas/:id` | id | `{ message }` | Autor o Admin |

### Usuarios

| Método | Endpoint | Cuerpo / Parámetros | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/usuarios/me` | — | Perfil del usuario (sin hash) | Usuario |
| PUT | `/usuarios/me` | UpdateUsuarioDto | Perfil actualizado (sin hash) | Usuario |
| PUT | `/usuarios/me/password` | ChangePasswordDto | `{ message }` | Usuario |
| GET | `/usuarios` | — | Todos los usuarios con recuento de pedidos | Admin |
| GET | `/usuarios/:id` | id | Usuario con historial completo de pedidos | Admin |

### Producto Imagenes

| Método | Endpoint | Cuerpo / Parámetros | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/producto-imagen/producto/:id` | id | Array de imágenes ordenadas por `orden` | Público |
| POST | `/producto-imagen` | CreateImagenDto | Imagen creada | Admin |
| PUT | `/producto-imagen/:id` | id + UpdateImagenDto | Imagen actualizada | Admin |
| DELETE | `/producto-imagen/:id` | id | `{ message }` | Admin |

---

## Autenticación y autorización

### Estructura del token JWT

Los tokens se firman con `HS256` y expiran a los 7 días. El payload contiene:

```json
{
  "sub": 1,
  "email": "usuario@ejemplo.com",
  "rol": "cliente",
  "iat": 1234567890,
  "exp": 1235172690
}
```

### Incluir el token en las peticiones

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Sistema de roles

| Rol | Creado por | Permisos |
|---|---|---|
| `cliente` | Por defecto al registrarse | Carrito propio, pedidos propios, perfil propio, reseñas de productos comprados |
| `administrador` | Asignación manual en BD | Gestión completa del catálogo, todos los pedidos, todos los usuarios, descuentos |

### Patrones de uso de guards

```typescript
// Endpoint público - sin guard
@Get()
findAll() {}

// Cualquier usuario autenticado
@UseGuards(JwtAuthGuard)
@Get('me')
findMe(@Request() req) {}

// Solo administrador
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
@Post()
create(@Body() dto) {}

// Protección a nivel de controlador (todos los métodos requieren auth)
@UseGuards(JwtAuthGuard)
@Controller('carrito')
export class CarritoController {}
```

### Códigos de error HTTP devueltos

| Código | Significado | Cuándo se devuelve |
|---|---|---|
| 400 | Bad Request | Fallo de validación, violación de regla de negocio (carrito vacío, stock insuficiente) |
| 401 | Unauthorized | Token JWT faltante, inválido o expirado |
| 403 | Forbidden | Token válido pero rol insuficiente, o acceso al recurso de otro usuario |
| 404 | Not Found | El recurso solicitado no existe en la base de datos |
| 409 | Conflict | Campo único duplicado (email ya registrado, nombre de categoría existe) |
| 500 | Internal Server Error | Excepción no gestionada (no debería ocurrir en operación normal) |

---

## Validación de datos

El `ValidationPipe` global en `main.ts` está configurado con:

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,            // elimina campos no declarados
  forbidNonWhitelisted: true, // devuelve 400 si hay campos no declarados
  transform: true,            // convierte cadenas de consulta a números, booleanos, etc
}));
```

Todos los DTOs usan decoradores de `class-validator`. Validadores comunes usados en el proyecto:

| Decorador | Valida |
|---|---|
| `@IsString()` | El valor es una cadena |
| `@IsEmail()` | El valor es una dirección de email válida |
| `@IsInt()` | El valor es un entero |
| `@IsNumber()` | El valor es un número (incluyendo decimales) |
| `@IsEnum(ClaseEnum)` | El valor es uno de los miembros del enum |
| `@IsBoolean()` | El valor es un booleano |
| `@IsDateString()` | El valor es una cadena de fecha ISO 8601 |
| `@IsOptional()` | El campo puede estar ausente o ser indefinido |
| `@Min(n)` | El valor numérico es al menos n |
| `@Max(n)` | El valor numérico es como máximo n |
| `@MinLength(n)` | La cadena tiene al menos n caracteres |
| `@Type(() => Number)` | Transforma el valor a Número (necesario para parámetros de consulta) |

---

## Documentación Swagger

La interfaz de Swagger está disponible en `http://localhost:3000/api`.

Cada endpoint está anotado con `@ApiOperation`, `@ApiResponse`, `@ApiParam`, `@ApiQuery` y `@ApiBearerAuth`. La documentación es completamente interactiva y permite probar todos los endpoints directamente desde el navegador.

Para autenticarse en Swagger:
1. Llamar a `POST /auth/login` y copiar el `access_token` de la respuesta
2. Hacer clic en el botón `Authorize` en la esquina superior derecha
3. Introducir el valor del token y hacer clic en `Authorize`
4. Todas las peticiones posteriores incluirán el token JWT automáticamente

---

## Docker

El `docker-compose.yml` se usa exclusivamente para desarrollo local. No se usa en producción donde MySQL corre directamente en el VPS.

```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: urbanwear_db
    environment:
      MYSQL_ROOT_PASSWORD: password123
      MYSQL_DATABASE: urbanwear
      MYSQL_USER: urbanwear_user
      MYSQL_PASSWORD: urbanwear_pass
    ports:
      - "3306:3306"
    volumes:
      - mysqldata:/var/lib/mysql

  phpmyadmin:
    image: phpmyadmin/phpmyadmin
    container_name: urbanwear_pma
    ports:
      - "8080:80"
    environment:
      PMA_HOST: mysql
    depends_on:
      - mysql

volumes:
  mysqldata:
```

| Servicio | Imagen | Puerto | Descripción |
|---|---|---|---|
| mysql | mysql:8.0 | 3306 | Base de datos principal |
| phpmyadmin | phpmyadmin/phpmyadmin | 8080 | Interfaz visual de administración de BD |

```bash
# Iniciar contenedores en segundo plano
docker compose up -d

# Parar y eliminar contenedores
docker compose down

# Ver contenedores en ejecución
docker ps

# Ver logs de MySQL
docker compose logs mysql

# Acceder a la CLI de MySQL
docker exec -it urbanwear_db mysql -u urbanwear_user -p urbanwear
```

---

## Estructura de archivos

```
urbanwear-backend/
|-- prisma/
|   `-- schema.prisma
|-- src/
|   |-- auth/
|   |   |-- dto/
|   |   |   |-- register.dto.ts
|   |   |   `-- login.dto.ts
|   |   |-- auth.controller.ts
|   |   |-- auth.module.ts
|   |   |-- auth.service.ts
|   |   |-- jwt-auth.guard.ts
|   |   `-- jwt.strategy.ts
|   |-- categorias/
|   |   |-- dto/
|   |   |   |-- create-categoria.dto.ts
|   |   |   `-- update-categoria.dto.ts
|   |   |-- categorias.controller.ts
|   |   |-- categorias.module.ts
|   |   `-- categorias.service.ts
|   |-- carrito/
|   |   |-- dto/
|   |   |   |-- add-carrito.dto.ts
|   |   |   `-- update-carrito.dto.ts
|   |   |-- carrito.controller.ts
|   |   |-- carrito.module.ts
|   |   `-- carrito.service.ts
|   |-- common/
|   |   |-- roles.decorator.ts
|   |   `-- roles.guard.ts
|   |-- descuentos/
|   |   |-- dto/
|   |   |   |-- create-descuento.dto.ts
|   |   |   |-- update-descuento.dto.ts
|   |   |   `-- validar-descuento.dto.ts
|   |   |-- descuentos.controller.ts
|   |   |-- descuentos.module.ts
|   |   `-- descuentos.service.ts
|   |-- pedidos/
|   |   |-- dto/
|   |   |   |-- create-pedido.dto.ts
|   |   |   `-- update-estado.dto.ts
|   |   |-- pedidos.controller.ts
|   |   |-- pedidos.module.ts
|   |   `-- pedidos.service.ts
|   |-- prisma/
|   |   |-- prisma.module.ts
|   |   `-- prisma.service.ts
|   |-- producto-imagen/
|   |   |-- dto/
|   |   |   |-- create-imagen.dto.ts
|   |   |   `-- update-imagen.dto.ts
|   |   |-- producto-imagen.controller.ts
|   |   |-- producto-imagen.module.ts
|   |   `-- producto-imagen.service.ts
|   |-- productos/
|   |   |-- dto/
|   |   |   |-- create-producto.dto.ts
|   |   |   |-- filtro-producto.dto.ts
|   |   |   `-- update-producto.dto.ts
|   |   |-- productos.controller.ts
|   |   |-- productos.module.ts
|   |   `-- productos.service.ts
|   |-- resenas/
|   |   |-- dto/
|   |   |   |-- create-resena.dto.ts
|   |   |   `-- update-resena.dto.ts
|   |   |-- resenas.controller.ts
|   |   |-- resenas.module.ts
|   |   `-- resenas.service.ts
|   |-- usuarios/
|   |   |-- dto/
|   |   |   |-- change-password.dto.ts
|   |   |   `-- update-usuario.dto.ts
|   |   |-- usuarios.controller.ts
|   |   |-- usuarios.module.ts
|   |   `-- usuarios.service.ts
|   |-- app.module.ts
|   `-- main.ts
|-- docker-compose.yml
|-- nest-cli.json
|-- tsconfig.json
|-- tsconfig.build.json
|-- package.json
`-- .env
```

---

## Autor

David Iguiño Cortés y Jesús Gonzálvez García — Desarrollo de Aplicaciones Web
Almería, España, 2026
