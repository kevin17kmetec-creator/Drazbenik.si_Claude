const fs = require('fs');
let content = fs.readFileSync('src/lib/translations.ts', 'utf8');

content = content.replace(
  'freeDesc: "Do 5 objav mesečno, 8% provizija",',
  'freeDesc: "Idealen začetek za občasne prodajalce. Paket vključuje do 5 objav dražb mesečno s standardno 8% provizijo ob uspešni prodaji.",'
);

content = content.replace(
  'basicDesc: "Do 50 objav mesečno, 6.5% provizija",',
  'basicDesc: "Za aktivne prodajalce. Objavite lahko do 50 dražb vsak mesec in prihranite pri prodaji z znižano 6.5% provizijo na uspešne transakcije.",'
);

content = content.replace(
  'proDesc: "Neomejeno objav, 3% provizija",',
  'proDesc: "Za profesionalce in podjetja z večjim volumnom. Brez omejitev števila objav dražb ter izjemno nizka 3% provizija za maksimalen dobiček.",'
);

fs.writeFileSync('src/lib/translations.ts', content);
