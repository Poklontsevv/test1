const GRID_W = 40; // tiles horizontally
const GRID_H = 22; // tiles vertically (roughly 540/24)
const TILE = 24;   // tile size
const ROUND_SECONDS = 180;

function rnd(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

export default class GameScene extends Phaser.Scene{
  constructor(){ super('Game'); }

  create(){
    this.timeLeft = ROUND_SECONDS;
    this.scores = {p1:0,p2:0};
    this.add.rectangle(0,0,960,540,0x0b0f14).setOrigin(0,0);

    // Generate cave using simple noise-ish logic
    this.blocks = this.add.group();
    this.blockData = {}; // key "x,y" => {hp,type,crystals}
    for(let y=3;y<GRID_H;y++){
      for(let x=0;x<GRID_W;x++){
        // surface air with some platforms
        const solidChance = y<6 ? 0.15 : 0.75;
        if(Math.random() < solidChance){
          const typeRoll = Math.random();
          let type='stone', hp=3, color=0x223044, crystals=0;
          if(typeRoll>0.85){ type='ore-red'; hp=2; color=0xB33A3A; crystals=2; }
          else if(typeRoll>0.70){ type='ore-cyan'; hp=2; color=0x2FB3C9; crystals=2; }
          else if(typeRoll>0.95){ type='ore-white'; hp=4; color=0xE0E6F8; crystals=5; }
          const r = this.add.rectangle(x*TILE+TILE/2,y*TILE+TILE/2,TILE-2,TILE-2,color).setOrigin(0.5);
          this.physics.add.existing(r,true);
          r.setData({x,y,hp,type,crystals});
          this.blocks.add(r);
          this.blockData[`${x},${y}`]=r;
        }
      }
    }

    // Create players
    this.players = this.add.group();
    this.p1 = this.spawnPlayer(80,100,0x5CDB95);
    this.p2 = this.spawnPlayer(880,100,0xF15BB5);
    this.players.addMultiple([this.p1, this.p2]);

    // Ground at bottom
    const ground = this.add.rectangle(480, 540-6, 960, 12, 0x14202b);
    this.physics.add.existing(ground,true);
    this.players.children.iterate(p=>this.physics.add.collider(p, ground));
    this.blocks.children.iterate(b=>{
      this.players.children.iterate(p=>this.physics.add.collider(p,b));
    });

    // Controls
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      W: 'W', A: 'A', S:'S', D:'D', SPACE:'SPACE', RCTRL:'RIGHTCTRL'
    });

    // Monsters
    this.monsters = this.physics.add.group();
    this.time.addEvent({ delay: 4000, loop:true, callback: ()=> this.spawnMonster() });
    this.physics.add.collider(this.monsters, ground);
    this.blocks.children.iterate(b=> this.physics.add.collider(this.monsters,b));
    this.players.children.iterate(p=>{
      this.physics.add.overlap(p, this.monsters, (pl, m)=> this.hitPlayer(pl,m));
    });

    // PvP overlap (melee)
    this.physics.add.overlap(this.p1, this.p2, (a,b)=>this.attemptHit(a,b));

    // 3-minute timer
    this.roundTimer = this.time.addEvent({
      delay: 1000, loop:true, callback: ()=>{
        this.timeLeft--;
        this.scene.get('UI').events.emit('tick', this.timeLeft);
        if(this.timeLeft<=0){ this.endRound(); }
      }
    });

    // Camera
    this.cameras.main.setBounds(0,0,GRID_W*TILE, GRID_H*TILE);
    this.cameras.main.startFollow(this.p1, true, 0.05, 0.05);
    this.input.keyboard.on('keydown-Q', ()=> this.cameras.main.startFollow(this.p1));
    this.input.keyboard.on('keydown-PERIOD', ()=> this.cameras.main.startFollow(this.p2));

    // Chest (spawns at end)
    this.chest = null;

    // UI init
    this.scene.get('UI').events.emit('updateScores', {p1:0,p2:0});
    this.scene.get('UI').events.emit('banner','Go mine!');
  }

  spawnPlayer(x,y,color){
    const body = this.add.rectangle(x,y,18,24,color).setOrigin(0.5);
    const pick = this.add.rectangle(0,0,12,4,0xffff66).setOrigin(0,0.5);
    this.physics.add.existing(body);
    body.body.setCollideWorldBounds(true);
    body.setData({hp:3, color});
    const container = this.add.container(x,y,[body,pick]);
    this.physics.world.enable(container);
    container.body.setSize(18,24);
    container.body.setCollideWorldBounds(true);
    container.setData({hp:3, pick, color, crystals:0, invul:0, lastSwing:0});
    return container;
  }

  update(time,delta){
    // Player 1 controls
    this.handlePlayer(
      this.p1,
      { left: this.keys.A.isDown, right: this.keys.D.isDown, up: this.keys.W.isDown, swing: this.keys.SPACE.isDown }
    );
    // Player 2 controls
    this.handlePlayer(
      this.p2,
      { left: this.cursors.left.isDown, right: this.cursors.right.isDown, up: this.cursors.up.isDown, swing: this.keys.RCTRL.isDown }
    );

    // Reduce invulnerability timers
    [this.p1,this.p2].forEach(p=>{
      if(p.getData('invul')>0) p.setData('invul', p.getData('invul') - delta);
      // rotate pick to face velocity
      const pick = p.getData('pick');
      pick.x = 10 * Math.sign(p.body.velocity.x || 1);
      pick.y = -4;
    });
  }

  handlePlayer(p, input){
    const speed = 160;
    if(input.left) p.body.setVelocityX(-speed);
    else if(input.right) p.body.setVelocityX(speed);
    else p.body.setVelocityX(0);

    if(input.up && p.body.blocked.down) p.body.setVelocityY(-330);

    if(input.swing) this.swingPick(p);
  }

  swingPick(p){
    const now = this.time.now;
    if(now - p.getData('lastSwing') < 220) return; // attack rate limit
    p.setData('lastSwing', now);
    const pick = p.getData('pick');
    this.tweens.add({ targets: pick, angle: -60, duration:100, yoyo:true });

    // Determine tile in front
    const dir = Math.sign(p.body.velocity.x || 1);
    const tx = Math.floor((p.x + dir*14)/TILE);
    const ty = Math.floor((p.y)/TILE);
    const key = `${tx},${ty}`;
    const block = this.blockData[key];
    if(block){
      let data = block.getData();
      data.hp--;
      block.fillColor = 0x666a77;
      if(data.hp<=0){
        // destroy and drop crystals
        const crystals = data.crystals || (data.type==='stone'?1:2);
        const drop = this.add.text(block.x, block.y, '✦'+crystals, {fontSize:16,color:'#fff'}).setOrigin(0.5);
        this.tweens.add({targets:drop, y:block.y-20, alpha:0, duration:700, onComplete:()=>drop.destroy()});
        p.setData('crystals', p.getData('crystals') + crystals);
        this.scene.get('UI').events.emit('updateScores', {p1:this.p1.getData('crystals'), p2:this.p2.getData('crystals')});
        delete this.blockData[key];
        block.destroy(true);
      } else {
        block.setData('hp', data.hp);
      }
    }
  }

  attemptHit(a,b){
    // If either just swung, apply small knockback
    const hitter = (a.getData('lastSwing')>b.getData('lastSwing'))?a:b;
    const victim = (hitter===a)?b:a;
    const now = this.time.now;
    if(now - hitter.getData('lastSwing') < 160 && victim.getData('invul')<=0){
      victim.setData('invul', 700);
      victim.body.velocity.x += 240 * Math.sign(hitter.x - victim.x) * -1;
      victim.body.velocity.y = -180;
      // drop 1/3 crystals on hit
      const lose = Math.min(victim.getData('crystals'), Math.max(1, Math.floor(victim.getData('crystals')/3)));
      victim.setData('crystals', victim.getData('crystals') - lose);
      hitter.setData('crystals', hitter.getData('crystals') + lose);
      this.scene.get('UI').events.emit('updateScores', {p1:this.p1.getData('crystals'), p2:this.p2.getData('crystals')});
      this.scene.get('UI').events.emit('banner', `-✦${lose} / +✦${lose}`);
    }
  }

  spawnMonster(){
    // simple hopping slime
    const x = rnd(40, 920);
    const slime = this.add.ellipse(x, 60, 18, 14, 0x77c8ff);
    this.physics.add.existing(slime);
    slime.body.setBounce(0.1).setCollideWorldBounds(true);
    slime.setData({nextHop:this.time.now + rnd(500,1600)});
    this.monsters.add(slime);
    this.time.addEvent({delay: 6000, callback: ()=> slime.destroy(), loop:false});
    this.events.on('update', ()=>{
      if(!slime.body) return;
      if(this.time.now>slime.getData('nextHop')){
        slime.body.setVelocity(rnd(-100,100), rnd(-180,-260));
        slime.setData('nextHop', this.time.now + rnd(600,1400));
      }
    });
  }

  hitPlayer(player, monster){
    if(player.getData('invul')>0) return;
    player.setData('invul', 700);
    player.body.velocity.x += 200 * Math.sign(monster.x - player.x) * -1;
    player.body.velocity.y = -180;
    // lose a crystal
    if(player.getData('crystals')>0){
      player.setData('crystals', player.getData('crystals')-1);
      this.scene.get('UI').events.emit('updateScores', {p1:this.p1.getData('crystals'), p2:this.p2.getData('crystals')});
    }
  }

  endRound(){
    this.roundTimer.remove(false);
    // Spawn chest in center
    const cx = 480, cy = 240;
    const chest = this.add.rectangle(cx, cy, 26, 18, 0xD9A441);
    this.physics.add.existing(chest, true);
    this.chest = chest;
    const banner = this.scene.get('UI');
    banner.events.emit('banner','Chest unlocked! Touch it.');
    this.players.children.iterate(p=>{
      this.physics.add.overlap(p, chest, ()=>{
        if(!this.chest) return;
        const bonus = 10;
        p.setData('crystals', p.getData('crystals') + bonus);
        banner.events.emit('banner', `+✦${bonus}`);
        banner.events.emit('updateScores', {p1:this.p1.getData('crystals'), p2:this.p2.getData('crystals')});
        this.chest.destroy(); this.chest = null;
        this.time.delayedCall(1200, ()=> this.finish());
      });
    });
  }

  finish(){
    const p1 = this.p1.getData('crystals'), p2=this.p2.getData('crystals');
    let msg = 'Draw!';
    if(p1>p2) msg = 'P1 wins!';
    else if(p2>p1) msg = 'P2 wins!';
    this.scene.get('UI').events.emit('banner', msg);
    this.time.delayedCall(1500, ()=> this.scene.restart());
  }
}
