const COLORS = ['#C4673A','#6B8F71','#C9A84C','#D4847A','#7B9EC5','#9B7FB5','#4AAFAB','#D46D8A'];

const venues = [
  { id:'r1', name:'La Taberna de El Sur', zone:'La Latina', tags:['tradicional','tapas','español'], price:22, schedule:'13:00-16:00, 20:00-00:00', url:'https://www.tabernaelsur.es', available:true, type:'RESTAURANT' },
  { id:'r2', name:'Bodega de la Ardosa', zone:'Malasaña', tags:['tradicional','tapas','vermouth'], price:15, schedule:'12:00-15:00, 19:00-23:00', url:'https://laardosa.es', available:true, type:'RESTAURANT' },
  { id:'r3', name:'Lateral Gran Vía', zone:'Centro', tags:['moderno','tapas','internacional'], price:28, schedule:'12:30-16:30, 20:00-00:30', url:'https://lateral.com', available:true, type:'RESTAURANT' },
  { id:'r4', name:'Trattoria Sant Arcangelo', zone:'Chamberí', tags:['italiano','pasta','romantico'], price:32, schedule:'13:00-16:00, 20:30-23:30', url:'https://trattoriasantarcangelo.com', available:true, type:'RESTAURANT' },
  { id:'r5', name:'Wagaboo Azca', zone:'Chamberí', tags:['asiatico','sushi','rapido'], price:18, schedule:'12:00-23:30', url:'https://wagaboo.com', available:true, type:'RESTAURANT' },
  { id:'r6', name:'Celso y Manolo', zone:'Centro', tags:['tradicional','tapas','vermut'], price:20, schedule:'11:00-16:00, 18:00-23:00', url:'https://celsoandmanolo.es', available:true, type:'RESTAURANT' },
  { id:'r7', name:'Naked & Famous Diner', zone:'Malasaña', tags:['americano','hamburgesas','rapido'], price:14, schedule:'12:00-23:00', url:'https://nakedandfamousdiner.com', available:true, type:'RESTAURANT' },
  { id:'r8', name:'Sagaretxe Taberna Vasca', zone:'Retiro', tags:['vasco','pintxos','tradicional'], price:25, schedule:'13:00-16:00, 20:00-23:30', url:'https://sagaretxetaberna.es', available:true, type:'RESTAURANT' },
  { id:'r9', name:'Federal Café', zone:'La Latina', tags:['vegetariano','brunch','moderno'], price:16, schedule:'09:00-17:00', url:'https://federalcafe.es', available:true, type:'RESTAURANT' },
  { id:'r10', name:'Crudos Madrid', zone:'Chamberí', tags:['vegetariano','vegano','saludable'], price:19, schedule:'13:00-16:00, 20:00-23:00', url:'https://crudosmadrid.com', available:true, type:'RESTAURANT' },
  { id:'r11', name:'El Restaurante del Círculo de Bellas Artes', zone:'Centro', tags:['tradicional','español','vistas'], price:40, schedule:'13:30-16:30, 21:00-23:30', url:'https://circulobellasartes.com', available:true, type:'RESTAURANT' },
  { id:'r12', name:'Somos', zone:'Retiro', tags:['mediterraneo','moderno','romantico'], price:35, schedule:'13:00-16:30, 20:30-00:00', url:'https://somosmadrid.com', available:true, type:'RESTAURANT' },
  { id:'a1', name:'Museo del Prado', zone:'Retiro', tags:['arte','cultura','historia'], price:15, schedule:'10:00-20:00', url:'https://www.museodelprado.es', available:true, type:'ACTIVITY' },
  { id:'a2', name:'Parque del Retiro', zone:'Retiro', tags:['naturaleza','fotografía','relax'], price:0, schedule:'06:00-22:00', url:'https://www.madrid.es/retiro', available:true, type:'ACTIVITY' },
  { id:'a3', name:'Museo Reina Sofía', zone:'Centro', tags:['arte','contemporaneo','cultura'], price:12, schedule:'10:00-21:00 (lun cerrado)', url:'https://www.museoreinasofia.es', available:true, type:'ACTIVITY' },
  { id:'a4', name:'Templo de Debod', zone:'Centro', tags:['historia','fotografía','monumentos'], price:0, schedule:'10:00-20:00', url:'https://www.madrid.es/debod', available:true, type:'ACTIVITY' },
  { id:'a5', name:'Palacio Real de Madrid', zone:'Centro', tags:['monumentos','historia','cultura'], price:14, schedule:'10:00-19:00', url:'https://www.patrimonionacional.es/palacio-real', available:true, type:'ACTIVITY' },
  { id:'a6', name:'Mercado de San Miguel', zone:'Centro', tags:['gastronomia','fotografía','moderno'], price:0, schedule:'10:00-00:00', url:'https://www.mercadodesanmiguel.es', available:true, type:'ACTIVITY' },
  { id:'a7', name:'Estadio Santiago Bernabéu (tour)', zone:'Chamberí', tags:['deporte','monumentos','adrenalina'], price:25, schedule:'09:30-19:00', url:'https://www.realmadrid.com/bernabeu', available:true, type:'ACTIVITY' },
  { id:'a8', name:'Matadero Madrid (Centro de Arte)', zone:'La Latina', tags:['arte','contemporaneo','fotografía'], price:0, schedule:'11:00-21:00 (lun cerrado)', url:'https://www.mataderomadrid.org', available:true, type:'ACTIVITY' },
  { id:'a9', name:'Escape Room Madrid — Lock & Go', zone:'Malasaña', tags:['adrenalina','grupos','diversión'], price:22, schedule:'10:00-22:00', url:'https://lockandgo.es', available:true, type:'ACTIVITY' },
  { id:'a10', name:'Teleférico de Madrid', zone:'Centro', tags:['naturaleza','vistas','fotografía'], price:8, schedule:'12:00-20:00', url:'https://www.teleferico.com', available:true, type:'ACTIVITY' },
  { id:'a11', name:'CaixaForum Madrid', zone:'Retiro', tags:['arte','cultura','exposiciones'], price:6, schedule:'10:00-20:00', url:'https://caixaforum.org/madrid', available:true, type:'ACTIVITY' },
  { id:'a12', name:'Ruta de Tapas por Lavapiés', zone:'La Latina', tags:['gastronomia','fotografía','diversión'], price:20, schedule:'12:00-22:00', url:'https://www.esmadrid.com', available:true, type:'ACTIVITY' }
];

const demoUsers = [
  { id: 'demo1', name: 'Bruno', color: COLORS[0], foodTags: ['tapas', 'tradicional'], activityTags: ['fotografía', 'monumentos', 'arte'], pace: 'moderado' },
  { id: 'demo2', name: 'Claudia', color: COLORS[1], foodTags: ['vegetariano', 'italiano'], activityTags: ['arte', 'naturaleza', 'cultura'], pace: 'relajado' }
];

module.exports = { COLORS, venues, demoUsers };
