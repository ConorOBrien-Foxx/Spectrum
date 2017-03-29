const fs = require("fs");
const PNG = require("pngjs").PNG;
const readline = require("readline");
const opn = require("opn");

let rl;

let startInput = () => {
    if(!rl){
        rl = readline.createInterface({
            input: process.stdin,
            output: process.stdin.isTTY ? process.stderr : null
        });
        rl.pause();
    }
}

const chunk = (arr, size) => {
    let res = [];
    for(let i = 0; i < arr.length; i += size){
        res.push(arr.slice(i, i + size));
    }
    return res;
}

const DEBUG = false;

const gettime = () => (new Date).toString().match(/\d+:\d+:\d+/)[0];

let queue = [];
let p = 0;
const timelog = (status, process) => {
    if(!DEBUG) return;
    let oldP = p;
    if(status === "end") p--;
    console.log("  ".repeat(p) + status + "ing process " + process + " at " + gettime());
    if(status === "end"){
        console.log("(took " + (+new Date - queue.pop()) + " ms)");
    }
    if(status === "start"){
        p++;
        queue.push(+new Date);
    }
    if(oldP == p)
        console.error("unknown status " + status);
}

const pngMap = (png, f) => {
    for(let y = 0; y < png.height; y++){
        for(let x = 0; x < png.width; x++){
            let idx = (png.width * y + x) << 2;
            f(png, idx, x, y);
        }
    }
}

const clone = (arr) => {
    if(typeof arr === "undefined"
    || typeof arr === "number"
    || typeof arr === "string"
    || typeof arr === "boolean") return arr;
    if(typeof arr.clone !== "undefined") return arr.clone();
    else if(typeof arr.map !== "undefined") return arr.map(clone);
    else if(arr instanceof Map) return new Map(arr);
    else return arr;
}

class Image {
    constructor(png){
        this.png = png;
        return this;
    }
    
    inspect(){
        return "Image { " + this.width + "x" + this.height + " }";
    }
    
    get width(){
        return this.png.width;
    }
    
    get height(){
        return this.png.height;
    }
    
    static output(im, fileName){
        if(!(im instanceof Image))
            im = Image.fromFile(im);
        let buffer = PNG.sync.write(im.png);
        fs.writeFileSync(fileName, buffer);
    }
    
    output(fileName){
        Image.output(this, fileName);
    }
    
    clone(){
        let copypng = new PNG({
            width: this.width,
            height: this.height,
            filterType: -1
        });
        copypng.data = clone(this.png.data);
        return new Image(copypng);
    }
    
    mapAlpha(f){
        timelog("start", "map");
        let copy = this.clone();
        pngMap(copy.png, (p, idx, x, y) => {
            let res = f(...[0, 1, 2, 3].map(e => p.data[idx + e]));
            for(let i = 0; i < 4; i++){
                if(typeof res[i] !== "undefined")
                    copy.png.data[idx + i] = res[i];
            }
        });
        timelog("end", "map");
        return copy;
    }
    
    map(f){
        return this.mapAlpha((r, g, b, a) => f(r, g, b).concat(a));
    }
    
    static invert(im){
        if(!(im instanceof Image))
            im = Image.fromFile(im);
        return im.map((...a) => a.map(e => 255 - e));
    }
    
    invert(){
        return Image.invert(this);
    }
    
    static isolate(im, channel){
        if(!(im instanceof Image))
            im = Image.fromFile(im);
        channel = channel.toLowerCase();
        let channelNumber = "rgb".indexOf(channel);
        return im.map((...a) => a.map((e, i) => i === channelNumber ? e : 0));
    }
    
    isolate(channel){
        return Image.isolate(this, channel);
    }
    
    static warhol(im, order = "rgb"){
        if(!(im instanceof Image))
            im = Image.fromFile(im);
        return im.stitchHorizontal(
            im.isolate(order[0])
        ).stitchVertical(
            im.isolate(order[1]).stitchHorizontal(im.isolate(order[2]))
        );
    }
    
    warhol(){
        return Image.warhol(this);
    }
    
    static stitchHorizontal(a, b){
        if(!(a instanceof Image))
            a = Image.fromFile(a);
        if(!(b instanceof Image))
            b = Image.fromFile(b);
        timelog("start", "horstitch");
        let am = a.toMatrix();
        let bm = b.toMatrix();
        let res = Image.fromMatrix(am.map((row, i) =>
            row.concat(
                bm[i] ? bm[i]
                      : bm[0].map(e => Image.padCell)
            )
        ));
        timelog("end", "horstitch");
        return res;
    }
    
    stitchHorizontal(b){
        return Image.stitchHorizontal(this, b);
    }
    
    static stitchVertical(a, b){
        if(!(a instanceof Image))
            a = Image.fromFile(a);
        if(!(b instanceof Image))
            b = Image.fromFile(b);
        let am = a.toMatrix();
        let bm = b.toMatrix();
        return Image.fromMatrix(am.concat(bm));
    }
    
    stitchVertical(b){
        return Image.stitchVertical(this, b);
    }
    
    static flipVertical(a){
        if(!(a instanceof Image))
            a = Image.fromFile(a);
        if(!(b instanceof Image))
            b = Image.fromFile(b);
        return Image.fromMatrix(a.toMatrix().reverse());
    }
    
    flipVertical(){
        return Image.flipVertical(this);
    }
    
    static flipHorizontal(a){
        if(!(a instanceof Image))
            a = Image.fromFile(a);
        if(!(b instanceof Image))
            b = Image.fromFile(b);
        return Image.fromMatrix(a.toMatrix().map(e => e.reverse()));
    }
    
    flipHorizontal(){
        return Image.flipHorizontal(this);
    }
    
    static fromFile(fileName){
        let data = fs.readFileSync(fileName);
        let png = PNG.sync.read(data, { filterType: -1 });
        // console.log(png, png.
        return new Image(png);
    }
    
    toMatrix(){
        let matrix = [];
        pngMap(this.png, (p, idx, x, y) => {
            matrix[y] = matrix[y] || [];
            matrix[y][x] = [0, 1, 2, 3].map(e => p.data[idx + e]);
        });
        return matrix;
    }
    
    static fromMatrix(mat){
        // pad to a square
        let maxWidth = Math.max(...mat.map(e => e.length));
        let matrix = mat.map(row => {
            while(row.length < maxWidth)
                row.push(Image.padCell);
            return row;
        });
        let respng = new PNG({
            width: maxWidth,
            height: matrix.length,
            filterType: -1
        });
        pngMap(respng, (p, idx, x, y) => {
            let curComponent = matrix[y][x];
            for(let i = 0; i < 4; i++){
                respng.data[idx + i] = curComponent[i] || 0;
            }
        });
        return new Image(respng);
    }
    
    static fromPPM(str){
        // parse out comments
        str = str.replace(/^#.*$/gm, "")
        // unify whitespace
                 .replace(/\s+/g, " ");
        let data = str.split(" ");
        let format = data.shift();
        let width = +data.shift();
        let height = +data.shift();
        let cellMax;
        if(format == "P1"){
            cellMax = 1;
            format = "P2";
            data = data.map(e => 1 - +e);
        } else {
            cellMax = +data.shift();
        }
        let matrix;
        if(format == "P2"){
            matrix = chunk(data, width).map(row =>
                row.map(c =>
                    [c, c, c].map(e => parseInt(e) / cellMax * 255).concat(255)
                )
            );
        } else if(format == "P3"){
            matrix = chunk(data, width * 3).map(
                e => chunk(e, 3).map(
                    triplet => triplet.map(e => parseInt(e) / cellMax * 255).concat(255)
                )
            );
        }
        return Image.fromMatrix(matrix);
    }
}

// transparent cell
Image.padCell = [255, 0, 255, 0];

class SpectrumToken {
    constructor(type, value){
        this.value = value;
        this.type = type;
    }
}

const getLine = (callback) => {
    startInput();
    rl.resume();
    rl.question("input> ", (line) => {
        rl.pause();
        callback(line);
    });
}

SpectrumToken.STRING = Symbol("string");
SpectrumToken.NUMBER = Symbol("number");
SpectrumToken.OP = Symbol("op");
SpectrumToken.FUNC = Symbol("func");
SpectrumToken.SETVAR = Symbol("setvar");
SpectrumToken.SETFUNC = Symbol("setfunc");

class Spectrum {
    constructor(prog){
        this.stack = [];
        this.regstack = [];
        this.vars = new Map([]);
        this.ops = clone(Spectrum.ops);
        this.beforehand = Spectrum.tokenize("['out.png's]#S   ['out.png'd@so]#O");
        this.toks = Spectrum.tokenize(prog);
        this.index = 0;
    }
    
    exec(cur, callback = () => {}){
        if(cur.type === SpectrumToken.STRING
        || cur.type === SpectrumToken.NUMBER){
            this.stack.push(cur.value);
            callback();
        }
        
        else if(cur.type === SpectrumToken.OP){
            if(this.ops.has(cur.value)){
                this.ops.get(cur.value).bind(this)(callback);
            } else if(this.vars.has(cur.value)){
                this.stack.push(this.vars.get(cur.value));
                callback();
            } else {
                console.error("unknown op `" + cur.value + "`");
                callback();
            }
        }
        
        else if(cur.type === SpectrumToken.FUNC){
            let inst = this;
            let f = function(callback){
                let chars = Spectrum.tokenize(cur.value);
                let exhaustChars = () => {
                    if(chars.length)
                        inst.exec(chars.shift(), exhaustChars);
                    else
                        callback();
                };
                exhaustChars();
            }
            f.toString = f.inspect = function(){ return "[" + cur.value + "]"; }
            inst.stack.push(f);
            callback();
        }
        
        else if(cur.type === SpectrumToken.SETVAR){
            this.vars.set(cur.value[1], this.stack.pop());
            callback();
        }
        
        else if(cur.type === SpectrumToken.SETFUNC){
            this.ops.set(cur.value[1], this.stack.pop());
            callback();
        }
    }
    
    step(callback = () => {}){
        let cur = this.toks[this.index];
        this.index++;
        this.exec(cur, callback);
    }
    
    run(callback = () => {}){
        if(this.beforehand.length)
            this.exec(this.beforehand.shift(), () => {
                this.run(callback);
            });
        
        else if(this.index < this.toks.length)
            this.step(() => {
                this.run(callback);
            });
        
        else callback(this.stack);
    }
    
    static run(prog, callback){
        return new Spectrum(prog).run(callback);
    }
    
    static tokenize(str){
        let toks = [];
        let i = 0;
        while(i < str.length){
            if(str[i] === "'"){
                let build = "";
                i++;
                while(!(str[i] === "'" && str[i + 1] !== "'") && i < str.length){
                    // escape quote
                    if(str[i] === "'" && str[i + 1] === "'"){
                        build += "'";
                        i += 2;
                    } else {
                        build += str[i++];
                    }
                }
                toks.push(new SpectrumToken(SpectrumToken.STRING, build));
            } else if(str[i] === "["){
                let depth = 1;
                i++;
                let build = "";
                while(i < str.length){
                    if(str[i] === "]") depth--;
                    else if(str[i] === "[") depth++;
                    if(depth <= 0) break;
                    build += str[i++];
                }
                toks.push(new SpectrumToken(SpectrumToken.FUNC, build));
            } else if(str[i] === ":"){
                toks.push(new SpectrumToken(SpectrumToken.SETVAR, str[i++] + str[i]));
            } else if(str[i] === "#"){
                toks.push(new SpectrumToken(SpectrumToken.SETFUNC, str[i++] + str[i]));
            } else if(/^[0-9]$/.test(str[i])){
                let build = "";
                while(/^[0-9]$/.test(str[i]))
                    build += str[i++];
                i--;
                toks.push(new SpectrumToken(SpectrumToken.NUMBER, +build));
            } else if(/^\s$/.test(str[i])){
                // do nothing
            } else {
                toks.push(new SpectrumToken(SpectrumToken.OP, str[i]));
            }
            i++;
        }
        return toks;
    }
    
    popArgs(n, callback){
        let args = [];
        let lineArgs = [];
        let gatherArgs = () => {
            if(n > 0){
                n--;
                if(this.stack.length === 0){
                    getLine((line) => {
                        lineArgs.push(line);
                        gatherArgs();
                    });
                    return;
                } else {
                    args.unshift(this.stack.pop());
                    return gatherArgs();
                }
            } else {
                return callback(lineArgs.concat(args));
            }
        }
        gatherArgs();
    }
    
    static lambda(f, arity = f.length){
        return function(callback = () => {}){
            let n = arity;
            this.popArgs(n, (args) => {
                let res = f.bind(this)(...args);
                if(typeof res !== "undefined")
                    this.stack.push(res);
                callback();
            });
        }
    }
}

//todo: variables and functions
Spectrum.ops = new Map([
    ["+", Spectrum.lambda((a, b) => a + b)],
    ["-", Spectrum.lambda((a, b) => a - b)],
    ["/", Spectrum.lambda((a, b) => a / b)],
    ["*", Spectrum.lambda((a, b) => a * b)],
    ["p", Spectrum.lambda(console.log, 1)],
    ["r", Spectrum.lambda(Image.fromFile)],
    ["i", Spectrum.lambda(Image.invert)],
    ["d", function(callback){
        this.popArgs(1, (args) => {
            this.stack.push(args[0], args[0]);
            callback.bind(this)();
        });
    }],
    ["~", function(callback){
        this.popArgs(2, (args) => {
            let [r, q] = args;
            this.stack.push(q, r);
            callback.bind(this)();
        });
    }],
    ["@", function(callback){
        this.popArgs(3, (args) => {
            let [s, r, q] = args;
            this.stack.push(q, s, r);
            callback.bind(this)();
        });
    }],
    ["s", Spectrum.lambda(Image.output)],
    ["o", function(callback){
        this.popArgs(1, (args) => {
            opn(args[0]);
            callback();
        });
    }],
    ["v", Spectrum.lambda(Image.stitchVertical)],
    ["h", Spectrum.lambda(Image.stitchHorizontal)],
    ["f", Spectrum.lambda(Image.flipHorizontal)],
    ["F", Spectrum.lambda(Image.flipVertical)],
    ["I", Spectrum.lambda(Image.isolate)],
    ["w", Spectrum.lambda(Image.warhol, 1)],
    ["W", Spectrum.lambda(Image.warhol, 2)],
    ["l", function(callback){
        getLine((line) => {
            this.stack.push(line);
            callback.bind(this)();
        });
    }],
    [",", Spectrum.lambda((x, y) => [x, y])],
    ["!", function(callback){
        this.stack.pop().bind(this)(callback);
    }],
    ["`", Spectrum.lambda(function(e){
        this.regstack.push(e);
    })],
    [".", Spectrum.lambda(function(){
        if(this.stack.length)
            return this.regstack.pop();
        else
            console.error("popping from an empty stack");
    })],
]);

if(require.main === module){
    if(process.argv.length < 2){
        console.log("usage:");
        console.log("  node spectrum.js <code>");
        console.log();
        console.log("Spectrum provides a minimalistic framework language for ease of use and testing,");
        console.log("which is accessed via command line invocation.");
        process.exit(1);
    }
    Spectrum.run(process.argv[2], (stack) => console.log(stack));
} else {
    module.exports = {
        Image: Image,
        Spectrum: Spectrum
    };
}


// png.pack().pipe(fs.createWriteStream("out.png"));