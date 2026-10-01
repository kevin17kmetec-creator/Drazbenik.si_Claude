const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /\}\)[\s\n]*\}[\s\n]*<\/div>[\s\n]*<\/div>[\s\n]*<\/div>[\s\n]*\);[\s\n]*break;/;
const replacement = `})
              )}
            </div>
          </div>
        </div>
      );
      break;`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', content);
console.log("Syntax fixed");
