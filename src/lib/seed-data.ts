/**
 * Datos semilla del festival demo. Única fuente de verdad para:
 *  - el modo demo en memoria (src/lib/db/memory.ts)
 *  - el script de carga a Supabase (scripts/seed.ts)
 *
 * Los ids son UUID v4 fijos para que enlaces y pruebas sean estables.
 * Contraseña de todas las cuentas demo: ver DEMO_PASSWORD.
 */

export const DEMO_PASSWORD = "demo1234";
export const DEMO_ADMIN_EMAIL = "admin@burgerliga.demo";

export interface SeedRestaurant {
  id: string;
  slug: string;
  name: string;
  city: string;
  description: string;
  instagram: string | null;
  /** Cuenta demo que administra este restaurante. */
  email: string;
}

export interface SeedDish {
  id: string;
  restaurant_id: string;
  name: string;
  inspired_by: string;
  story: string;
  ingredients: string[];
  /** Ruta local en /public/demo (se sube al bucket en Supabase durante el seed). */
  image: string;
  is_published: boolean;
  /** Votos válidos de ejemplo con los que arranca el demo. */
  demo_votes: number;
}

const r = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const d = (n: number) => `10000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

export const SEED_RESTAURANTS: SeedRestaurant[] = [
  { id: r(1),  slug: "la-fragua",        name: "La Fragua Burgers",        city: "Zipaquirá",     description: "Parrilla de carbón y pan de masa madre horneado a diario.", instagram: "lafraguaburgers", email: "la-fragua@burgerliga.demo" },
  { id: r(2),  slug: "sal-y-brasa",      name: "Sal & Brasa",              city: "Zipaquirá",     description: "Cocina de fuego lento inspirada en la Catedral de Sal.", instagram: "salybrasa", email: "sal-y-brasa@burgerliga.demo" },
  { id: r(3),  slug: "puerto-ahumado",   name: "Puerto Ahumado",           city: "Chía",          description: "Ahumados de 14 horas y salsas de la casa.", instagram: "puertoahumado", email: "puerto-ahumado@burgerliga.demo" },
  { id: r(4),  slug: "manigua",          name: "Manigua Cocina Salvaje",   city: "Cajicá",        description: "Ingredientes de la selva y el río llevados al pan.", instagram: "maniguacocina", email: "manigua@burgerliga.demo" },
  { id: r(5),  slug: "el-tambor",        name: "El Tambor Burger Bar",     city: "Chía",          description: "Sabor caribe, fiesta y picante.", instagram: "eltamborbb", email: "el-tambor@burgerliga.demo" },
  { id: r(6),  slug: "paramo",           name: "Páramo",                   city: "Zipaquirá",     description: "Cocina de altura: papa criolla, queso campesino y hierbas.", instagram: "paramo.burger", email: "paramo@burgerliga.demo" },
  { id: r(7),  slug: "marea-alta",       name: "Marea Alta",               city: "Cajicá",        description: "Del Pacífico al altiplano: coco, chontaduro y mar.", instagram: "mareaaltaco", email: "marea-alta@burgerliga.demo" },
  { id: r(8),  slug: "ruta-40",          name: "Ruta 40 Smash",            city: "Tenjo",         description: "Smash burgers de carretera con queso fundido.", instagram: "ruta40smash", email: "ruta-40@burgerliga.demo" },
  { id: r(9),  slug: "casa-cafetal",     name: "Casa Cafetal",             city: "Zipaquirá",     description: "Todo pasa por el café: salsas, glaseados y pan.", instagram: "casacafetal", email: "casa-cafetal@burgerliga.demo" },
  { id: r(10), slug: "la-guajira",       name: "Wayuu Grill",              city: "Chía",          description: "Chivo, sal de mar y desierto en cada bocado.", instagram: "wayuugrill", email: "la-guajira@burgerliga.demo" },
  { id: r(11), slug: "montana-roja",     name: "Montaña Roja",             city: "Nemocón",       description: "Cocina santandereana con carácter: hormiga culona y cabro.", instagram: "montanaroja", email: "montana-roja@burgerliga.demo" },
  { id: r(12), slug: "barrio-egipto",    name: "Barrio Egipto Burger",     city: "Zipaquirá",     description: "Homenaje a los sabores del centro de Bogotá.", instagram: "barrioegiptoburger", email: "barrio-egipto@burgerliga.demo" },
  { id: r(13), slug: "isla-verde",       name: "Isla Verde",               city: "Cajicá",        description: "Ritmo raizal: coco, cangrejo y pimienta.", instagram: "islaverdeco", email: "isla-verde@burgerliga.demo" },
  { id: r(14), slug: "volcan",           name: "Volcán Burgers",           city: "Tenjo",         description: "Cocina nariñense de leña y ají.", instagram: "volcanburgers", email: "volcan@burgerliga.demo" },
];

export const SEED_DISHES: SeedDish[] = [
  {
    id: d(1), restaurant_id: r(1), name: "La Catedral", inspired_by: "Catedral de Sal · Zipaquirá",
    story: "A 180 metros bajo tierra los mineros muiscas y luego los cundinamarqueses tallaron una catedral en sal. Esta burger rinde homenaje a esa oscuridad brillante: pan negro de carbón activado, carne madurada en sal de Zipaquirá y un toque de miel que recuerda las velas de la nave central.",
    ingredients: ["Pan brioche negro de carbón", "Blend de res madurado 21 días", "Sal de roca de Zipaquirá", "Queso Paipa fundido", "Cebolla caramelizada con miel", "Mayonesa de ajo negro"],
    image: "/demo/burger-01.jpg", is_published: true, demo_votes: 248,
  },
  {
    id: d(2), restaurant_id: r(2), name: "Guerrera Muisca", inspired_by: "Laguna de Guatavita · Cundinamarca",
    story: "La leyenda de El Dorado nació en Guatavita, donde el cacique se cubría de oro y se lanzaba a la laguna. Doramos el pan con mantequilla de achiote y lo coronamos con un huevo de yema naranja: nuestro pequeño ritual dorado.",
    ingredients: ["Pan de papa dorado en achiote", "Carne de res 180 g", "Huevo de campo frito", "Tocineta crocante", "Queso doble crema", "Salsa de uchuva y ají"],
    image: "/demo/burger-02.jpg", is_published: true, demo_votes: 231,
  },
  {
    id: d(3), restaurant_id: r(3), name: "Brisket del Magdalena", inspired_by: "Río Magdalena · Honda, Tolima",
    story: "Por el Magdalena subían los vapores cargados de tabaco, café y noticias. Ahumamos el brisket 14 horas con madera de guayabo, como se ahumaba el pescado en las orillas del río, y lo servimos con hogao de tomate chonto.",
    ingredients: ["Pan de masa madre", "Brisket ahumado 14 h", "Hogao de tomate chonto", "Queso costeño rallado", "Plátano maduro asado", "Pepinillos de la casa"],
    image: "/demo/burger-03.jpg", is_published: true, demo_votes: 204,
  },
  {
    id: d(4), restaurant_id: r(4), name: "Manigua", inspired_by: "Amazonas · Leticia",
    story: "En la selva el pescado se envuelve en hoja de bijao y se cocina sobre brasas. Nuestra burger lleva pirarucú ahumado, ají negro (tucupí) y una crema de copoazú. Sabores que casi nadie del altiplano conoce y que queremos que prueben.",
    ingredients: ["Pan de yuca brava", "Pirarucú ahumado", "Tucupí (ají negro)", "Crema de copoazú", "Lechuga de agua", "Farofa de casabe"],
    image: "/demo/burger-04.jpg", is_published: true, demo_votes: 187,
  },
  {
    id: d(5), restaurant_id: r(5), name: "Carnaval", inspired_by: "Carnaval de Barranquilla",
    story: "Quien lo vive es quien lo goza. Esta burger es una comparsa: chorizo de Soledad, suero costeño, queso de capa y una salsa de mango biche con ají que pica como un pick-up a las 3 de la mañana.",
    ingredients: ["Pan de leche", "Carne de res y chorizo de Soledad", "Queso de capa", "Suero costeño", "Salsa de mango biche", "Cebolla morada encurtida"],
    image: "/demo/burger-05.jpg", is_published: true, demo_votes: 163,
  },
  {
    id: d(6), restaurant_id: r(6), name: "Frailejón", inspired_by: "Páramo de Sumapaz · Cundinamarca",
    story: "El páramo más grande del mundo queda a dos horas de aquí y casi nadie lo ha visto. Papa criolla frita, queso campesino y una mayonesa de hierbas de altura (guascas, cilantro cimarrón) que huele a niebla y a fogón de leña.",
    ingredients: ["Pan de papa", "Carne de res 160 g", "Papa criolla crocante", "Queso campesino", "Mayonesa de guascas", "Cebolla larga asada"],
    image: "/demo/burger-06.jpg", is_published: true, demo_votes: 141,
  },
  {
    id: d(7), restaurant_id: r(7), name: "Chontaduro", inspired_by: "Pacífico · Buenaventura",
    story: "Del puerto de Buenaventura llegan el coco, el chontaduro y la marimba. Camarón apanado en coco, salsa de chontaduro y un pan que huele a titoté. Cada bocado suena a currulao.",
    ingredients: ["Pan con leche de coco", "Camarón apanado en coco", "Salsa de chontaduro", "Lechuga crespa", "Ají de piña", "Plátano verde crocante"],
    image: "/demo/burger-07.jpg", is_published: true, demo_votes: 118,
  },
  {
    id: d(8), restaurant_id: r(8), name: "Ruta del Sol", inspired_by: "Carretera Bogotá – Costa",
    story: "Doce horas de bus, ventas de arepa de huevo y música a todo volumen. Doble smash con queso americano, cebolla en la plancha y una salsa de ajo rosada como la de los asaderos de carretera.",
    ingredients: ["Pan brioche tostado", "Doble smash 2 × 90 g", "Queso americano", "Cebolla a la plancha", "Salsa rosada de ajo", "Pepinillos"],
    image: "/demo/burger-08.jpg", is_published: true, demo_votes: 97,
  },
  {
    id: d(9), restaurant_id: r(9), name: "Grano de Oro", inspired_by: "Eje Cafetero · Salento",
    story: "El café no solo se bebe. Glaseamos la tocineta con reducción de café de Salento y panela, y el pan lleva un toque de espresso. Es la burger que huele a finca a las cinco de la mañana.",
    ingredients: ["Pan brioche de espresso", "Carne de res 180 g", "Tocineta glaseada en café y panela", "Queso cheddar madurado", "Cebolla crispy", "Mayonesa ahumada"],
    image: "/demo/burger-09.jpg", is_published: true, demo_votes: 84,
  },
  {
    id: d(10), restaurant_id: r(10), name: "Wayuu", inspired_by: "Desierto de La Guajira · Cabo de la Vela",
    story: "En La Guajira el chivo se cocina lento y se come con arepa de maíz y sal de Manaure. Friche de chivo desmechado, queso de cabra y un ají de cebolla roja que corta el desierto.",
    ingredients: ["Arepa-pan de maíz", "Friche de chivo", "Queso de cabra", "Sal de Manaure", "Ají de cebolla roja", "Ahuyama asada"],
    image: "/demo/burger-10.jpg", is_published: true, demo_votes: 66,
  },
  {
    id: d(11), restaurant_id: r(11), name: "Cabro Santandereano", inspired_by: "Cañón del Chicamocha · Santander",
    story: "Del cañón más grande del país traemos el cabro y la hormiga culona, que se come hace más de 500 años. Carne de cabro braseada, pepitoria en la salsa y hormiga tostada por encima para el crunch.",
    ingredients: ["Pan de yuca", "Cabro braseado", "Salsa de pepitoria", "Hormiga culona tostada", "Queso de hoja", "Tomate asado"],
    image: "/demo/burger-11.jpg", is_published: true, demo_votes: 52,
  },
  {
    id: d(12), restaurant_id: r(12), name: "La Candelaria", inspired_by: "Centro histórico · Bogotá",
    story: "Ajiaco en burger: pollo desmechado, crema de papa sabanera con guascas, alcaparras y mazorca. Es el almuerzo de La Candelaria en un pan, con la lluvia de fondo.",
    ingredients: ["Pan de maíz", "Pollo desmechado", "Crema de papa sabanera con guascas", "Alcaparras", "Mazorca tierna", "Aguacate"],
    image: "/demo/burger-12.jpg", is_published: true, demo_votes: 39,
  },
  {
    id: d(13), restaurant_id: r(13), name: "Rondón", inspired_by: "San Andrés y Providencia",
    story: "El rondón es la olla comunitaria de la isla: pescado, cangrejo, leche de coco y pimienta. Convertimos esa olla en una burger de cangrejo con salsa de coco y pimienta de Providencia.",
    ingredients: ["Pan de coco", "Torta de cangrejo", "Salsa de leche de coco", "Pimienta de Providencia", "Repollo morado", "Ají dulce"],
    image: "/demo/burger-13.jpg", is_published: true, demo_votes: 21,
  },
  {
    id: d(14), restaurant_id: r(14), name: "Galeras", inspired_by: "Volcán Galeras · Pasto, Nariño",
    story: "Pasto vive al pie de un volcán activo. Cuy ahumado (sí, cuy), papa nativa morada y ají de maní tostado. Un plato que casi nadie se atreve a hacer en burger.",
    ingredients: ["Pan de papa morada", "Cuy ahumado desmechado", "Ají de maní", "Queso de Pasto", "Cebolla de bulbo encurtida", "Hierbabuena"],
    image: "/demo/burger-14.jpg", is_published: true, demo_votes: 9,
  },
];

export const SEED_SETTINGS = {
  festival_name: "Burger Liga",
  edition: "Séptima edición · Sabana Centro 2026",
  tagline: "Cada plato cuenta la historia de un lugar de Colombia. Busca tu favorito y vota: tu voto vale el 30 % de la calificación.",
  voting_open: true,
  ip_soft_limit: 3,
  ip_hard_limit: 8,
  strict_device_match: true,
  suspect_threshold: 60,
};
