export const LABELS = {
  person:'Pessoa', bicycle:'Bicicleta', car:'Carro', motorcycle:'Moto', airplane:'Avião', bus:'Ônibus', train:'Trem', truck:'Caminhão', boat:'Barco',
  'traffic light':'Semáforo', 'fire hydrant':'Hidrante', 'stop sign':'Placa de pare', 'parking meter':'Parquímetro', bench:'Banco',
  bird:'Pássaro', cat:'Gato', dog:'Cachorro', horse:'Cavalo', sheep:'Ovelha', cow:'Vaca', elephant:'Elefante', bear:'Urso', zebra:'Zebra', giraffe:'Girafa',
  backpack:'Mochila', umbrella:'Guarda-chuva', handbag:'Bolsa', tie:'Gravata', suitcase:'Mala', frisbee:'Frisbee', skis:'Esquis', snowboard:'Snowboard',
  'sports ball':'Bola', kite:'Pipa', 'baseball bat':'Taco de beisebol', 'baseball glove':'Luva de beisebol', skateboard:'Skate', surfboard:'Prancha', 'tennis racket':'Raquete de tênis',
  bottle:'Garrafa', 'wine glass':'Taça', cup:'Copo', fork:'Garfo', knife:'Faca', spoon:'Colher', bowl:'Tigela',
  banana:'Banana', apple:'Maçã', sandwich:'Sanduíche', orange:'Laranja', broccoli:'Brócolis', carrot:'Cenoura', 'hot dog':'Cachorro-quente', pizza:'Pizza', donut:'Rosquinha', cake:'Bolo',
  chair:'Cadeira', couch:'Sofá', 'potted plant':'Jardineira', bed:'Cama', 'dining table':'Mesa', toilet:'Vaso sanitário', tv:'Televisão',
  laptop:'Notebook', mouse:'Mouse', remote:'Controle remoto', keyboard:'Teclado', 'cell phone':'Celular', microwave:'Micro-ondas', oven:'Forno', toaster:'Torradeira', sink:'Pia',
  refrigerator:'Geladeira', book:'Livro', clock:'Relógio', vase:'Vaso de flor', scissors:'Tesoura', 'teddy bear':'Ursinho de pelúcia', 'hair drier':'Secador de cabelo', toothbrush:'Escova de dentes'
};

export const RISK_BIAS = {
  person:1.2, bicycle:1.15, car:1.2, motorcycle:1.2, bus:1.2, truck:1.2, train:1.2,
  dog:1.1, horse:1.1,
  backpack:1.05, suitcase:1.05, 'sports ball':1.05,
};

export const TALL = new Set(['person','dog','cat','horse','refrigerator','fire hydrant','traffic light','stop sign','parking meter']);

export const TYPES_SIM = ['person','car','chair','dog','backpack','box'];
