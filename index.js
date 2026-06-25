import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
  AuditLogEvent,
  EmbedBuilder,
} from 'discord.js';
import { QuickDB } from 'quick.db';
import OpenAI from 'openai';

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.DISCORD_OWNER_ID;
const PREFIX = process.env.PREFIX || 's';

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN.');
  process.exit(1);
}
if (!OWNER_ID) {
  console.error('Missing DISCORD_OWNER_ID.');
  process.exit(1);
}

const db = new QuickDB();

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

const isOwner = (id) => id === OWNER_ID;

async function getAllowed() {
  return (await db.get('allowed_users')) || [];
}
async function isAllowed(id) {
  if (isOwner(id)) return true;
  const list = await getAllowed();
  return list.includes(id);
}

async function logToOwner(text) {
  try {
    const owner = await client.users.fetch(OWNER_ID);
    await owner.send(`📩 ${text}`);
  } catch {
    /* ignore */
  }
}

// ---------------- Per-guild config ----------------
async function getConfig(guildId) {
  return (await db.get(`config_${guildId}`)) || {};
}
async function setConfig(guildId, patch) {
  const c = await getConfig(guildId);
  await db.set(`config_${guildId}`, { ...c, ...patch });
}

async function sendLog(guild, text, color = 0x5865f2) {
  try {
    const cfg = await getConfig(guild.id);
    if (!cfg.logChannel) return;
    const ch = await guild.channels.fetch(cfg.logChannel).catch(() => null);
    if (!ch) return;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setDescription(text)
      .setTimestamp();
    ch.send({ embeds: [embed] }).catch(() => {});
  } catch {
    /* ignore */
  }
}

function parseChannelId(arg) {
  if (!arg) return null;
  const m = arg.match(/^<#(\d+)>$/) || arg.match(/^(\d+)$/);
  return m ? m[1] : null;
}
function parseRoleId(arg) {
  if (!arg) return null;
  const m = arg.match(/^<@&(\d+)>$/) || arg.match(/^(\d+)$/);
  return m ? m[1] : null;
}

async function resolveMember(msg, args) {
  const mention = msg.mentions.members.first();
  if (mention) return mention;
  const raw = args.join(' ').trim();
  if (!raw) return null;
  const idMatch = raw.match(/^<@!?(\d+)>$/) || raw.match(/^(\d+)$/);
  if (idMatch) {
    return await msg.guild.members.fetch(idMatch[1]).catch(() => null);
  }
  const q = raw.toLowerCase();
  await msg.guild.members.fetch().catch(() => {});
  return (
    msg.guild.members.cache.find(
      (m) =>
        m.user.username.toLowerCase() === q ||
        m.displayName.toLowerCase() === q ||
        m.user.tag.toLowerCase() === q,
    ) ||
    msg.guild.members.cache.find(
      (m) =>
        m.user.username.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q),
    ) ||
    null
  );
}

const PUBLIC_COMMANDS = new Set([
  'help', 'shelp', 'ping', 'hi', 'info', 'iam', 'iamnot', 'selfroles', 'ticket', 'close',
]);

const DEFAULT_BADWORDS = [
  // English
  'fuck', 'fuk', 'fck', 'fucker', 'fucking', 'mf', 'motherfucker', 'mofo',
  'shit', 'shitty', 'bullshit', 'bs',
  'bitch', 'biatch', 'btch', 'son of a bitch', 'sob',
  'asshole', 'asshat', 'arsehole', 'ass',
  'bastard', 'dumbass', 'jackass',
  'dick', 'dickhead', 'cock', 'cocksucker', 'prick',
  'pussy', 'cunt', 'twat',
  'slut', 'whore', 'hoe', 'thot', 'skank',
  'faggot', 'fag', 'dyke', 'tranny',
  'nigger', 'nigga', 'n1gga', 'n1gger',
  'retard', 'retarded', 'spaz',
  'damn', 'goddamn', 'hell',
  'piss', 'pissed',
  'wanker', 'tosser', 'bollocks', 'bugger',
  'crap', 'douche', 'douchebag',
  'rape', 'rapist', 'molest',
  // Hindi (transliterated)
  'chutiya', 'chutia', 'chutiye', 'chutiyo', 'chootiya', 'chuthiya',
  'madarchod', 'madharchod', 'mc', 'maderchod', 'mader chod', 'madar chod',
  'behenchod', 'behanchod', 'bhenchod', 'bhencho', 'bc', 'bahenchod',
  'bhosdike', 'bhosdike', 'bhosdi', 'bhosdiwala', 'bhosadike', 'bhosadi',
  'bhosadchod', 'bhosadiwala',
  'gandu', 'gaandu', 'gand', 'gaand', 'gandmasti', 'gandfat',
  'lund', 'lawda', 'lauda', 'laude', 'laudu', 'lavde', 'lawde',
  'loda', 'lode', 'lodu',
  'chod', 'chodu', 'chodne', 'chudai', 'chudwa', 'chudwale', 'chudai',
  'randi', 'randwa', 'randwe', 'randibaaz',
  'haraami', 'harami', 'haramkhor', 'haramzada', 'haramzade',
  'kutta', 'kutte', 'kutti', 'kuttiya',
  'kamina', 'kamine', 'kameena',
  'saala', 'sala', 'saale', 'sale', 'saali', 'sali',
  'gaandu', 'gandfat', 'gandphat',
  'jhaant', 'jhant', 'jhantu',
  'tatti', 'tatte',
  'bhadwa', 'bhadwe', 'bhadwi',
  'chinaal', 'chinal',
  'maa ki', 'maa ka', 'teri maa', 'tere baap', 'tere maa',
  'bhen ke', 'behen ke', 'behen ka', 'behen ki',
  'bsdk', 'mkc', 'mkb', 'tmkc',
];

const WARN_LIMIT = 3;
const NUM_EMOJIS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
const isAdmin = (member) =>
  member?.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
  isOwner(member?.id);

client.once('ready', () => {
  console.log(`⚡ Storm Bot v10 READY: ${client.user.tag}`);
});

// =================== AUTO-JOIN (owner DMs an invite link) ===================
const INVITE_RE = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite\/|discord\.gg\/)([a-zA-Z0-9-]+)/i;
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.type !== ChannelType.DM) return;
  if (!isOwner(msg.author.id)) return;
  const match = msg.content.match(INVITE_RE);
  if (!match) return;
  try {
    const invite = await client.fetchInvite(match[1]);
    const guildName = invite.guild?.name || 'unknown';
    const guildId = invite.guild?.id;
    const memberCount = invite.memberCount || invite.approximateMemberCount || '?';
    if (guildId && client.guilds.cache.has(guildId)) {
      return msg.reply(`✅ Already in **${guildName}** (${memberCount} members).`);
    }
    const adminPerms = PermissionsBitField.All.toString();
    const url =
      `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}` +
      `&scope=bot&permissions=${adminPerms}` +
      (guildId ? `&guild_id=${guildId}&disable_guild_select=true` : '');
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🔗 Auto-join ready')
      .setDescription(
        `Server: **${guildName}**\nMembers: ${memberCount}\n\n` +
          `Discord doesn't let bots accept regular invites — you have to add me yourself. ` +
          `Tap the link below (you need **Manage Server** there):\n\n[**Add me to ${guildName}**](${url})`,
      );
    return msg.reply({ embeds: [embed] });
  } catch (e) {
    return msg.reply(`❌ Couldn't read that invite: ${e.message}`);
  }
});

// =================== DM OWNER COMMANDS ===================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.type !== ChannelType.DM) return;
  if (!isOwner(msg.author.id)) return;
  if (INVITE_RE.test(msg.content)) return; // handled above

  const parts = msg.content.trim().split(/ +/);
  const cmd = (parts.shift() || '').toLowerCase();
  const guild = client.guilds.cache.first();
  if (!guild) return msg.reply('No guild available.');

  try {
    if (cmd === 'ban') {
      const id = parts[0];
      const member = await guild.members.fetch(id);
      await member.ban({ reason: 'Owner DM ban' });
      return msg.reply(`Banned ${member.user.tag}.`);
    }
    if (cmd === 'kick') {
      const id = parts[0];
      const member = await guild.members.fetch(id);
      await member.kick('Owner DM kick');
      return msg.reply(`Kicked ${member.user.tag}.`);
    }
    if (cmd === 'unban') {
      const id = parts[0];
      await guild.members.unban(id);
      return msg.reply(`Unbanned ${id}.`);
    }
    if (cmd === 'help' || cmd === 'shelp') {
      return msg.reply('DM commands: `ban <id>`, `kick <id>`, `unban <id>`');
    }
  } catch (err) {
    return msg.reply(`Error: ${err.message}`);
  }
});

// =================== GUILD COMMANDS ===================
client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot || !msg.guild) return;

    // -------- XP SYSTEM --------
    const xpKey = `xp_${msg.guild.id}_${msg.author.id}`;
    const xp = ((await db.get(xpKey)) || 0) + 5;
    await db.set(xpKey, xp);
    if (xp > 0 && xp % 100 === 0) {
      msg.channel.send(`🎉 ${msg.author.username} leveled up! XP: ${xp}`).catch(() => {});
    }

    // -------- ANTI-SPAM --------
    const lastKey = `last_${msg.author.id}`;
    const last = await db.get(lastKey);
    if (last && Date.now() - last < 1000 && !isOwner(msg.author.id)) {
      msg.delete().catch(() => {});
      return;
    }
    await db.set(lastKey, Date.now());

    if (!msg.content.startsWith(PREFIX)) return;

    const args = msg.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = (args.shift() || '').toLowerCase();
    if (!cmd) return;

    // -------- PUBLIC: SELF ROLES --------
    if (cmd === 'selfroles') {
      const cfg = await getConfig(msg.guild.id);
      const list = cfg.selfRoles || [];
      if (!list.length) return msg.reply('No self-assignable roles configured.');
      const lines = list.map((id) => `• <@&${id}> — \`${PREFIX}iam ${id}\``);
      return msg.reply(`**Self-assignable roles:**\n${lines.join('\n')}`);
    }
    if (cmd === 'iam' || cmd === 'iamnot') {
      const cfg = await getConfig(msg.guild.id);
      const list = cfg.selfRoles || [];
      const arg = args[0];
      if (!arg) return msg.reply(`Usage: \`${PREFIX}iam <role mention or id>\``);
      let id = parseRoleId(arg);
      if (!id) {
        const role = msg.guild.roles.cache.find((r) => r.name.toLowerCase() === arg.toLowerCase());
        id = role?.id;
      }
      if (!id || !list.includes(id)) return msg.reply('That role is not self-assignable.');
      const member = msg.member;
      if (cmd === 'iamnot' || member.roles.cache.has(id)) {
        await member.roles.remove(id).catch(() => {});
        return msg.reply(`Removed <@&${id}>`);
      }
      await member.roles.add(id).catch(() => {});
      return msg.reply(`Added <@&${id}>`);
    }

    // -------- ALLOWLIST MGMT (owner only) --------
    if (cmd === 'allow' || cmd === 'disallow' || cmd === 'allowed') {
      if (!isOwner(msg.author.id)) return msg.reply('❌ Only the owner can manage the allowlist.');
      const list = await getAllowed();
      if (cmd === 'allowed') {
        if (!list.length) return msg.reply('No allowed users (owner only).');
        return msg.reply('**Allowed users:**\n' + list.map((id) => `• <@${id}>`).join('\n'));
      }
      const target = msg.mentions.users.first();
      const id = target?.id || args[0];
      if (!id) return msg.reply(`Usage: \`${PREFIX}${cmd} @user\``);
      if (cmd === 'allow') {
        if (!list.includes(id)) list.push(id);
        await db.set('allowed_users', list);
        return msg.reply(`✅ <@${id}> can now use the bot.`);
      } else {
        await db.set('allowed_users', list.filter((x) => x !== id));
        return msg.reply(`✅ <@${id}> removed from allowlist.`);
      }
    }

    // Owner/allowed lock for everything else
    if (!(await isAllowed(msg.author.id)) && !PUBLIC_COMMANDS.has(cmd)) {
      return msg.reply('❌ You are not allowed to use this bot.');
    }

    // -------- MODERATION --------
    if (cmd === 'ban') {
      const user = await resolveMember(msg, args);
      if (!user) return msg.reply('User not found.');
      const me = msg.guild.members.me;
      if (!me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return msg.reply('❌ I need **Ban Members** permission.');
      }
      if (user.id === msg.guild.ownerId) return msg.reply('❌ Cannot ban the server owner.');
      if (user.id === client.user.id) return msg.reply('❌ I cannot ban myself.');
      if (me.roles.highest.position <= user.roles.highest.position) {
        return msg.reply("❌ My role must be **above** the target's highest role.");
      }
      try {
        await user.ban({ reason: 'Storm ban' });
        await msg.delete().catch(() => {});
        msg.channel.send(`🚫 Banned: ${user.user.tag}`);
        logToOwner(`Ban: ${user.user.tag}`);
        sendLog(msg.guild, `🚫 **Ban** — ${user.user.tag} by ${msg.author.tag}`, 0xed4245);
      } catch (e) {
        msg.reply(`❌ Ban failed: ${e.message || e}`);
      }
      return;
    }

    // -------- CONFIG (admin/owner) --------
    if (cmd === 'setlogs' || cmd === 'logs') {
      const id = parseChannelId(args[0]);
      if (!id) return msg.reply(`Usage: \`${PREFIX}setlogs #channel\``);
      await setConfig(msg.guild.id, { logChannel: id });
      return msg.reply(`✅ Log channel set to <#${id}>`);
    }
    if (cmd === 'setwelcome' || cmd === 'welcome') {
      const id = parseChannelId(args[0]);
      if (!id) return msg.reply(`Usage: \`${PREFIX}setwelcome #channel\``);
      await setConfig(msg.guild.id, { welcomeChannel: id });
      return msg.reply(`✅ Welcome channel set to <#${id}>`);
    }
    if (cmd === 'setjailrole' || cmd === 'jailrole') {
      const id = parseRoleId(args[0]);
      if (!id) return msg.reply(`Usage: \`${PREFIX}setjailrole @role\``);
      await setConfig(msg.guild.id, { jailRole: id });
      return msg.reply(`✅ Jail role set to <@&${id}>`);
    }
    if (cmd === 'setvcrole' || cmd === 'vcrole') {
      const id = parseRoleId(args[0]);
      if (!id) {
        await setConfig(msg.guild.id, { vcRole: null });
        return msg.reply('✅ VC role cleared.');
      }
      await setConfig(msg.guild.id, { vcRole: id });
      return msg.reply(`✅ VC role set to <@&${id}> (auto-assigned in voice)`);
    }
    if (cmd === 'selfrole') {
      const sub = (args[0] || '').toLowerCase();
      const cfg = await getConfig(msg.guild.id);
      const list = cfg.selfRoles || [];
      if (sub === 'add') {
        const id = parseRoleId(args[1]);
        if (!id) return msg.reply(`Usage: \`${PREFIX}selfrole add @role\``);
        if (!list.includes(id)) list.push(id);
        await setConfig(msg.guild.id, { selfRoles: list });
        return msg.reply(`✅ Added <@&${id}> as self-assignable.`);
      }
      if (sub === 'remove' || sub === 'rm') {
        const id = parseRoleId(args[1]);
        const next = list.filter((x) => x !== id);
        await setConfig(msg.guild.id, { selfRoles: next });
        return msg.reply(`✅ Removed <@&${id}>`);
      }
      if (sub === 'list' || !sub) {
        if (!list.length) return msg.reply('No self-assignable roles.');
        return msg.reply(list.map((id) => `• <@&${id}>`).join('\n'));
      }
      return msg.reply(`Usage: \`${PREFIX}selfrole add|remove|list @role\``);
    }
    if (cmd === 'autoreact') {
      const sub = (args[0] || '').toLowerCase();
      const cfg = await getConfig(msg.guild.id);
      const map = cfg.autoreact || {};
      if (sub === 'add') {
        const chId = parseChannelId(args[1]);
        const emoji = args[2];
        if (!chId || !emoji) return msg.reply(`Usage: \`${PREFIX}autoreact add #channel <emoji>\``);
        map[chId] = (map[chId] || []).concat(emoji);
        await setConfig(msg.guild.id, { autoreact: map });
        return msg.reply(`✅ Will react with ${emoji} in <#${chId}>`);
      }
      if (sub === 'remove' || sub === 'off') {
        const chId = parseChannelId(args[1]);
        delete map[chId];
        await setConfig(msg.guild.id, { autoreact: map });
        return msg.reply(`✅ Cleared autoreact in <#${chId}>`);
      }
      if (sub === 'list' || !sub) {
        const lines = Object.entries(map).map(([id, es]) => `<#${id}> → ${es.join(' ')}`);
        return msg.reply(lines.length ? lines.join('\n') : 'No autoreacts set.');
      }
      return msg.reply(`Usage: \`${PREFIX}autoreact add|remove|list #channel <emoji>\``);
    }
    if (cmd === 'badword') {
      const sub = (args[0] || '').toLowerCase();
      const cfg = await getConfig(msg.guild.id);
      const list = cfg.badwords || [];
      if (sub === 'add') {
        const w = (args[1] || '').toLowerCase();
        if (!w) return msg.reply('Provide a word.');
        if (!list.includes(w)) list.push(w);
        await setConfig(msg.guild.id, { badwords: list });
        return msg.reply(`✅ Added bad word.`);
      }
      if (sub === 'remove' || sub === 'rm') {
        const w = (args[1] || '').toLowerCase();
        const next = list.filter((x) => x !== w);
        await setConfig(msg.guild.id, { badwords: next });
        return msg.reply(`✅ Removed.`);
      }
      if (sub === 'list' || !sub) {
        return msg.reply(list.length ? `\`\`\`\n${list.join(', ')}\n\`\`\`` : 'No bad words set.');
      }
      return msg.reply(`Usage: \`${PREFIX}badword add|remove|list <word>\``);
    }
    if (cmd === 'config') {
      const cfg = await getConfig(msg.guild.id);
      const fmt = (v) => (v ? (typeof v === 'string' ? v : JSON.stringify(v)) : '—');
      return msg.reply(
        [
          '**Server config**',
          `Logs: ${cfg.logChannel ? `<#${cfg.logChannel}>` : '—'}`,
          `Welcome: ${cfg.welcomeChannel ? `<#${cfg.welcomeChannel}>` : '—'}`,
          `Jail role: ${cfg.jailRole ? `<@&${cfg.jailRole}>` : '—'}`,
          `VC role: ${cfg.vcRole ? `<@&${cfg.vcRole}>` : '—'}`,
          `Self roles: ${(cfg.selfRoles || []).length}`,
          `Autoreacts: ${Object.keys(cfg.autoreact || {}).length}`,
          `Bad words: ${(cfg.badwords || []).length}`,
        ].join('\n'),
      );
    }

    // -------- ACTIVATE (one-shot setup) --------
    if (cmd === 'activate' || cmd === 'setup') {
      const me = msg.guild.members.me;
      if (
        !me.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
        !me.permissions.has(PermissionsBitField.Flags.ManageRoles)
      ) {
        return msg.reply('❌ I need **Manage Channels** and **Manage Roles** to activate.');
      }
      await msg.reply('⚡ Activating Storm Bot — setting up roles & channels...');
      try {
        // 1. Jail role
        let jailRole = msg.guild.roles.cache.find((r) => r.name === 'Jailed');
        if (!jailRole) {
          jailRole = await msg.guild.roles.create({
            name: 'Jailed',
            color: 0x808080,
            reason: 'Storm Bot activation',
          });
        }
        // 2. Category
        let category = msg.guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildCategory && c.name === 'storm-bot',
        );
        if (!category) {
          category = await msg.guild.channels.create({
            name: 'storm-bot',
            type: ChannelType.GuildCategory,
          });
        }
        // 3. Channels
        const ensureChannel = async (name) => {
          let ch = msg.guild.channels.cache.find(
            (c) => c.name === name && c.parentId === category.id,
          );
          if (!ch) {
            ch = await msg.guild.channels.create({
              name,
              type: ChannelType.GuildText,
              parent: category.id,
            });
          }
          return ch;
        };
        const logsCh = await ensureChannel('mod-logs');
        const welcomeCh = await ensureChannel('welcome');
        const jailCh = await ensureChannel('jail');

        // 4. Lock jail role out of every channel except #jail
        for (const ch of msg.guild.channels.cache.values()) {
          if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildVoice) continue;
          if (ch.id === jailCh.id) {
            await ch.permissionOverwrites
              .edit(jailRole, { ViewChannel: true, SendMessages: true })
              .catch(() => {});
          } else {
            await ch.permissionOverwrites
              .edit(jailRole, { SendMessages: false, AddReactions: false, Speak: false })
              .catch(() => {});
          }
        }

        // 5. Save config
        await setConfig(msg.guild.id, {
          logChannel: logsCh.id,
          welcomeChannel: welcomeCh.id,
          jailRole: jailRole.id,
        });

        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('✅ Storm Bot Activated')
          .setDescription('Server is fully set up. All security & moderation features are live.')
          .addFields(
            { name: 'Logs', value: `<#${logsCh.id}>`, inline: true },
            { name: 'Welcome', value: `<#${welcomeCh.id}>`, inline: true },
            { name: 'Jail role', value: `<@&${jailRole.id}>`, inline: true },
            { name: 'Jail channel', value: `<#${jailCh.id}>`, inline: true },
          )
          .setFooter({ text: `Type ${PREFIX}help to see all commands` });
        return msg.channel.send({ embeds: [embed] });
      } catch (e) {
        return msg.reply(`❌ Activation failed: ${e.message || e}`);
      }
    }

    // -------- WARN SYSTEM --------
    if (cmd === 'warn') {
      const target = await resolveMember(msg, [args[0]]);
      if (!target) return msg.reply('User not found.');
      const reason = args.slice(1).join(' ') || 'No reason';
      const key = `warns_${msg.guild.id}_${target.id}`;
      const list = (await db.get(key)) || [];
      list.push({ by: msg.author.tag, reason, at: Date.now() });
      await db.set(key, list);
      msg.channel.send(`⚠️ Warned ${target.user.tag} (${list.length}/${WARN_LIMIT}) — ${reason}`);
      sendLog(msg.guild, `⚠️ **Warn** — ${target.user.tag} (${list.length}/${WARN_LIMIT}) by ${msg.author.tag}: ${reason}`, 0xfee75c);
      if (list.length >= WARN_LIMIT) {
        const cfg = await getConfig(msg.guild.id);
        const me = msg.guild.members.me;
        const canJail =
          cfg.jailRole &&
          msg.guild.roles.cache.has(cfg.jailRole) &&
          me.roles.highest.position > target.roles.highest.position &&
          target.id !== msg.guild.ownerId;
        if (canJail) {
          const previous = target.roles.cache
            .filter((r) => r.id !== msg.guild.id && r.editable)
            .map((r) => r.id);
          await db.set(`jail_${msg.guild.id}_${target.id}`, previous);
          for (const rid of previous) {
            await target.roles.remove(rid).catch(() => {});
          }
          await target.roles.add(cfg.jailRole).catch(() => {});
          msg.channel.send(`⛓️ Auto-jailed ${target.user.tag} (warn limit reached)`);
          sendLog(msg.guild, `⛓️ **Auto-jail** — ${target.user.tag} (${WARN_LIMIT} warns)`, 0xed4245);
        } else if (me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
          await target.timeout(10 * 60 * 1000, 'Warn limit').catch(() => {});
          msg.channel.send(`🔇 Auto-muted ${target.user.tag} 10m (warn limit)`);
        }
        await db.set(key, []);
      }
      return;
    }
    if (cmd === 'warnings' || cmd === 'warns') {
      const target = (await resolveMember(msg, args)) || msg.member;
      const list = (await db.get(`warns_${msg.guild.id}_${target.id}`)) || [];
      if (!list.length) return msg.reply(`${target.user.tag} has no warnings.`);
      const lines = list.map((w, i) => `${i + 1}. ${w.reason} — *by ${w.by}*`);
      return msg.reply(`**${target.user.tag} — ${list.length}/${WARN_LIMIT}**\n${lines.join('\n')}`);
    }
    if (cmd === 'warnclear' || cmd === 'clearwarns') {
      const target = await resolveMember(msg, args);
      if (!target) return msg.reply('User not found.');
      await db.delete(`warns_${msg.guild.id}_${target.id}`);
      sendLog(msg.guild, `🧹 **Warns cleared** — ${target.user.tag} by ${msg.author.tag}`, 0x57f287);
      return msg.reply(`✅ Cleared warnings for ${target.user.tag}`);
    }

    // -------- REACTION ROLES --------
    if (cmd === 'rrpanel') {
      const chId = parseChannelId(args[0]);
      const channel = chId ? await msg.guild.channels.fetch(chId).catch(() => null) : msg.channel;
      const roleIds = args.slice(chId ? 1 : 0).map(parseRoleId).filter(Boolean);
      if (!roleIds.length) return msg.reply(`Usage: \`${PREFIX}rrpanel [#channel] @role1 @role2 ...\` (max 10)`);
      const roles = roleIds.slice(0, 10);
      const lines = roles.map((id, i) => `${NUM_EMOJIS[i]} <@&${id}>`);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎭 Reaction Roles')
        .setDescription(`React to get/remove a role.\n\n${lines.join('\n')}`);
      const sent = await channel.send({ embeds: [embed] });
      for (let i = 0; i < roles.length; i++) {
        await sent.react(NUM_EMOJIS[i]).catch(() => {});
      }
      await db.set(`rr_${sent.id}`, roles);
      return msg.reply(`✅ Panel posted in <#${channel.id}>`);
    }

    // -------- JAIL --------
    if (cmd === 'jail') {
      const cfg = await getConfig(msg.guild.id);
      if (!cfg.jailRole) return msg.reply(`Set a jail role first: \`${PREFIX}setjailrole @role\``);
      const target = await resolveMember(msg, args);
      if (!target) return msg.reply('User not found.');

      const me = msg.guild.members.me;
      if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return msg.reply('❌ I need **Manage Roles** permission.');
      }
      if (target.id === msg.guild.ownerId) return msg.reply('❌ Cannot jail the server owner.');
      if (me.roles.highest.position <= target.roles.highest.position) {
        return msg.reply("❌ My role must be **above** the target's highest role.");
      }
      const jailRole = msg.guild.roles.cache.get(cfg.jailRole);
      if (!jailRole) return msg.reply('❌ Configured jail role no longer exists.');
      if (me.roles.highest.position <= jailRole.position) {
        return msg.reply('❌ My role must be **above** the jail role.');
      }

      const removable = target.roles.cache
        .filter((r) => r.id !== msg.guild.id && r.editable)
        .map((r) => r.id);
      await db.set(`jail_${msg.guild.id}_${target.id}`, removable);

      try {
        for (const rid of removable) {
          await target.roles.remove(rid).catch(() => {});
        }
        await target.roles.add(cfg.jailRole);
        msg.channel.send(`⛓️ Jailed ${target.user.tag}`);
        sendLog(msg.guild, `⛓️ **Jail** — ${target.user.tag} by ${msg.author.tag}`, 0xed4245);
      } catch (e) {
        msg.reply(`❌ Jail failed: ${e.message || e}`);
      }
      return;
    }
    if (cmd === 'unjail') {
      const cfg = await getConfig(msg.guild.id);
      const target = await resolveMember(msg, args);
      if (!target) return msg.reply('User not found.');
      const prev = (await db.get(`jail_${msg.guild.id}_${target.id}`)) || [];
      try {
        if (cfg.jailRole) await target.roles.remove(cfg.jailRole).catch(() => {});
        for (const rid of prev) {
          await target.roles.add(rid).catch(() => {});
        }
        await db.delete(`jail_${msg.guild.id}_${target.id}`);
        msg.channel.send(`🗝️ Unjailed ${target.user.tag}`);
        sendLog(msg.guild, `🗝️ **Unjail** — ${target.user.tag} by ${msg.author.tag}`, 0x57f287);
      } catch (e) {
        msg.reply(`❌ Unjail failed: ${e.message || e}`);
      }
      return;
    }

    if (cmd === 'kick') {
      const user = await resolveMember(msg, args);
      if (!user) return msg.reply('User not found.');
      const me = msg.guild.members.me;
      if (!me.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return msg.reply('❌ I need **Kick Members** permission.');
      }
      if (user.id === msg.guild.ownerId) return msg.reply('❌ Cannot kick the server owner.');
      if (user.id === client.user.id) return msg.reply('❌ I cannot kick myself.');
      if (me.roles.highest.position <= user.roles.highest.position) {
        return msg.reply("❌ My role must be **above** the target's highest role.");
      }
      try {
        await user.kick('Storm kick');
        await msg.delete().catch(() => {});
        msg.channel.send(`👢 Kicked: ${user.user.tag}`);
        logToOwner(`Kick: ${user.user.tag}`);
        sendLog(msg.guild, `👢 **Kick** — ${user.user.tag} by ${msg.author.tag}`, 0xfee75c);
      } catch (e) {
        msg.reply(`❌ Kick failed: ${e.message || e}`);
      }
      return;
    }

    if (cmd === 'unban') {
      const id = args[0];
      if (!id) return msg.reply(`Usage: \`${PREFIX}unban <user_id>\``);
      if (!msg.guild.members.me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return msg.reply('❌ I need **Ban Members** permission.');
      }
      try {
        await msg.guild.members.unban(id);
        await msg.delete().catch(() => {});
        msg.channel.send(`✅ Unbanned ${id}`);
        logToOwner(`Unban: ${id}`);
        sendLog(msg.guild, `✅ **Unban** — <@${id}> by ${msg.author.tag}`, 0x57f287);
      } catch (e) {
        msg.reply(`❌ Unban failed: ${e.message || e}`);
      }
      return;
    }

    if (cmd === 'mute') {
      const minutes = parseInt(args[args.length - 1], 10);
      const targetArgs = isNaN(minutes) ? args : args.slice(0, -1);
      const mins = isNaN(minutes) ? 5 : minutes;
      const user = await resolveMember(msg, targetArgs);
      if (!user) return msg.reply(`Usage: \`${PREFIX}mute @user [minutes]\``);
      const me = msg.guild.members.me;
      if (!me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return msg.reply('❌ I need **Timeout Members** (Moderate Members) permission.');
      }
      if (user.id === msg.guild.ownerId) return msg.reply('❌ Cannot mute the server owner.');
      if (me.roles.highest.position <= user.roles.highest.position) {
        return msg.reply("❌ My role must be **above** the target's highest role.");
      }
      try {
        await user.timeout(mins * 60 * 1000, 'Storm mute');
        await msg.delete().catch(() => {});
        msg.channel.send(`🔇 Muted ${user.user.tag} for ${mins} min`);
        logToOwner(`Mute: ${user.user.tag} (${mins}m)`);
        sendLog(msg.guild, `🔇 **Mute** — ${user.user.tag} (${mins}m) by ${msg.author.tag}`, 0xfee75c);
      } catch (e) {
        msg.reply(`❌ Mute failed: ${e.message || e}`);
      }
      return;
    }

    if (cmd === 'unmute') {
      const user = await resolveMember(msg, args);
      if (!user) return msg.reply(`Usage: \`${PREFIX}unmute @user\``);
      const me = msg.guild.members.me;
      if (!me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return msg.reply('❌ I need **Timeout Members** (Moderate Members) permission.');
      }
      if (me.roles.highest.position <= user.roles.highest.position) {
        return msg.reply("❌ My role must be **above** the target's highest role.");
      }
      try {
        await user.timeout(null, 'Storm unmute');
        await msg.delete().catch(() => {});
        msg.channel.send(`🔊 Unmuted ${user.user.tag}`);
        logToOwner(`Unmute: ${user.user.tag}`);
        sendLog(msg.guild, `🔊 **Unmute** — ${user.user.tag} by ${msg.author.tag}`, 0x57f287);
      } catch (e) {
        msg.reply(`❌ Unmute failed: ${e.message || e}`);
      }
      return;
    }

    if (cmd === 'target') {
      const member = await resolveMember(msg, [args[0]]);
      const minutes = parseInt(args[1] || '10', 10);
      if (!member) return msg.reply(`Usage: \`${PREFIX}target @user [minutes]\``);
      const me = msg.guild.members.me;
      if (!me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return msg.reply('❌ I need **Timeout Members** (Moderate Members) permission.');
      }
      if (member.id === msg.guild.ownerId) return msg.reply('❌ Cannot target the server owner.');
      if (me.roles.highest.position <= member.roles.highest.position) {
        return msg.reply("❌ My role must be **above** the target's highest role.");
      }
      try {
        await member.timeout(minutes * 60 * 1000, 'Storm target');
        await msg.delete().catch(() => {});
        msg.channel.send(`🎯 Timed out ${member.user.tag} for ${minutes} min`);
        logToOwner(`Target: ${member.user.tag} (${minutes}m)`);
      } catch (e) {
        msg.reply(`❌ Target failed: ${e.message || e}`);
      }
      return;
    }

    if (cmd === 'lock') {
      if (!msg.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return msg.reply('❌ I need **Manage Channels** permission.');
      }
      try {
        await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, {
          SendMessages: false,
        });
        // Keep owner + allowed users + bot able to chat
        const exempt = new Set([OWNER_ID, client.user.id, ...(await getAllowed())]);
        for (const id of exempt) {
          await msg.channel.permissionOverwrites
            .edit(id, { SendMessages: true, ViewChannel: true })
            .catch(() => {});
        }
        return msg.channel.send('🔒 Channel locked. (Owner & allowed users can still chat.)');
      } catch (e) {
        return msg.reply(`❌ Lock failed: ${e.message || e}`);
      }
    }

    if (cmd === 'unlock') {
      if (!msg.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return msg.reply('❌ I need **Manage Channels** permission.');
      }
      try {
        await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, {
          SendMessages: null,
        });
        // Clear the per-user exemptions added by lock
        const exempt = new Set([OWNER_ID, ...(await getAllowed())]);
        for (const id of exempt) {
          await msg.channel.permissionOverwrites
            .edit(id, { SendMessages: null, ViewChannel: null })
            .catch(() => {});
        }
        return msg.channel.send('🔓 Channel unlocked.');
      } catch (e) {
        return msg.reply(`❌ Unlock failed: ${e.message || e}`);
      }
    }

    if (cmd === 'raidmode') {
      if (!isOwner(msg.author.id)) return msg.reply('❌ Owner only.');
      const sub = (args[0] || '').toLowerCase();
      const cfg = await getConfig(msg.guild.id);
      const cur = cfg.raidMode || { enabled: false, minAgeDays: 7, action: 'jail' };
      if (sub === 'on') {
        const days = parseInt(args[1], 10);
        const action = (args[2] || cur.action || 'jail').toLowerCase();
        if (!['jail', 'kick', 'ban'].includes(action)) {
          return msg.reply(`Action must be \`jail\`, \`kick\`, or \`ban\`.`);
        }
        cur.enabled = true;
        cur.minAgeDays = !isNaN(days) && days > 0 ? days : (cur.minAgeDays || 7);
        cur.action = action;
        await setConfig(msg.guild.id, { raidMode: cur });
        return msg.reply(`🛡️ Raid mode **ON** — accounts younger than **${cur.minAgeDays}d** will be **${cur.action}ed** on join.`);
      }
      if (sub === 'off') {
        cur.enabled = false;
        await setConfig(msg.guild.id, { raidMode: cur });
        return msg.reply('🛡️ Raid mode **OFF**.');
      }
      return msg.reply(
        `**Raid mode:** ${cur.enabled ? `🟢 ON — <${cur.minAgeDays}d → ${cur.action}` : '🔴 OFF'}\n` +
        `Usage: \`${PREFIX}raidmode on [days] [jail|kick|ban]\` • \`${PREFIX}raidmode off\``,
      );
    }

    if (cmd === 'antinuke') {
      if (!isOwner(msg.author.id)) return msg.reply('❌ Owner only.');
      const cfg = await getConfig(msg.guild.id);
      const an = cfg.antinuke || {};
      const sub = (args[0] || '').toLowerCase();

      const TOGGLES = {
        joinflood:   'Auto-lockdown on 5+ joins/10s',
        msgrateban:  'Mute on 6+ msgs/5s',
        mentionban:  'Mute/ban on 5+ mentions',
        webhookban:  'Delete + ban unauthorized webhooks',
        masskick:    'Ban on 3+ kicks/10s',
        phishing:    'Delete phishing/scam links',
        tokendetect: 'Delete Discord token leaks',
        antinuke:    'Ban on mass channel/role delete',
        takeover:    'Revert role/server edits by non-owner',
      };

      if (sub === 'toggle') {
        const key = (args[1] || '').toLowerCase();
        if (!TOGGLES[key]) {
          return msg.reply(`Unknown setting. Options: \`${Object.keys(TOGGLES).join('`, `')}\``);
        }
        an[key] = an[key] === false ? true : false;
        await setConfig(msg.guild.id, { antinuke: an });
        return msg.reply(`🛡️ **${key}** → ${an[key] === false ? '🔴 OFF' : '🟢 ON'}`);
      }

      const lines = Object.entries(TOGGLES).map(([k, label]) => {
        const state = an[k] === false ? '🔴' : '🟢';
        return `${state} \`${k}\` — ${label}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🛡️ Anti-Nuke Settings')
        .setDescription(lines.join('\n'))
        .addFields(
          { name: '🚨 Join Flood', value: '5+ joins in 10s → auto-lockdown + raid mode', inline: true },
          { name: '⚡ Msg Flood', value: '6+ msgs in 5s → 5min mute', inline: true },
          { name: '📣 Mass Mention', value: '5+ pings → 10min mute, 2nd = ban', inline: true },
          { name: '🔗 Webhooks', value: 'Unauthorized webhook → deleted + ban', inline: true },
          { name: '👢 Mass Kick', value: '3+ kicks/10s → ban executor', inline: true },
          { name: '🚫 Mass Delete', value: 'Channel/role mass delete → ban', inline: true },
          { name: '🔐 Takeover', value: 'Role/server perm escalation → reverted + ban', inline: true },
          { name: '🎣 Phishing', value: 'Scam links → delete + 30min mute, 2nd = ban', inline: true },
          { name: '🔑 Token Leak', value: 'Token pattern in msg → instant delete + DM', inline: true },
        )
        .setFooter({ text: `Toggle: ${PREFIX}antinuke toggle <name>` });
      return msg.reply({ embeds: [embed] });
    }

    if (cmd === 'lockall' || cmd === 'lockdown') {
      if (!isOwner(msg.author.id)) return msg.reply('❌ Owner only.');
      if (!msg.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return msg.reply('❌ I need **Manage Channels** permission.');
      }
      await msg.reply('🔒 Locking every channel...');
      const exempt = new Set([OWNER_ID, client.user.id, ...(await getAllowed())]);
      let ok = 0, fail = 0;
      for (const ch of msg.guild.channels.cache.values()) {
        if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildVoice) continue;
        try {
          await ch.permissionOverwrites.edit(msg.guild.roles.everyone, {
            SendMessages: false,
            Speak: false,
            AddReactions: false,
          });
          for (const id of exempt) {
            await ch.permissionOverwrites
              .edit(id, { SendMessages: true, Speak: true, ViewChannel: true, AddReactions: true })
              .catch(() => {});
          }
          ok++;
        } catch {
          fail++;
        }
      }
      sendLog(msg.guild, `🔒 **LOCKDOWN** by ${msg.author.tag} — ${ok} channels locked`, 0xed4245);
      return msg.channel.send(`🔒 Lockdown complete — locked **${ok}** channels${fail ? ` (${fail} failed)` : ''}.`);
    }

    if (cmd === 'unlockall' || cmd === 'unlockdown') {
      if (!isOwner(msg.author.id)) return msg.reply('❌ Owner only.');
      if (!msg.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return msg.reply('❌ I need **Manage Channels** permission.');
      }
      await msg.reply('🔓 Unlocking every channel...');
      const exempt = new Set([OWNER_ID, ...(await getAllowed())]);
      let ok = 0, fail = 0;
      for (const ch of msg.guild.channels.cache.values()) {
        if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildVoice) continue;
        try {
          await ch.permissionOverwrites.edit(msg.guild.roles.everyone, {
            SendMessages: null,
            Speak: null,
            AddReactions: null,
          });
          for (const id of exempt) {
            await ch.permissionOverwrites
              .edit(id, { SendMessages: null, Speak: null, ViewChannel: null, AddReactions: null })
              .catch(() => {});
          }
          ok++;
        } catch {
          fail++;
        }
      }
      sendLog(msg.guild, `🔓 **Lockdown lifted** by ${msg.author.tag} — ${ok} channels unlocked`, 0x57f287);
      return msg.channel.send(`🔓 Unlocked **${ok}** channels${fail ? ` (${fail} failed)` : ''}.`);
    }

    if (cmd === 'clear') {
      const n = Math.min(parseInt(args[0] || '10', 10), 100);
      if (!msg.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return msg.reply('I need Manage Messages permission.');
      }
      const deleted = await msg.channel.bulkDelete(n + 1, true);
      const note = await msg.channel.send(`🧹 Cleared ${deleted.size - 1} messages.`);
      setTimeout(() => note.delete().catch(() => {}), 3000);
      return;
    }

    // -------- AI --------
    if (cmd === 'ai') {
      const q = args.join(' ');
      if (!q) return;
      await msg.delete().catch(() => {});
      try {
        const res = await openai.chat.completions.create({
          model: 'gpt-5.4',
          max_completion_tokens: 1024,
          messages: [{ role: 'user', content: q }],
        });
        const out = res.choices[0]?.message?.content?.trim() || 'No response.';
        msg.channel.send(`🤖 ${out.slice(0, 1900)}`);
      } catch (err) {
        console.error('AI error:', err);
        msg.channel.send('🤖 AI unavailable right now.');
      }
      return;
    }

    // -------- GAMES --------
    if (cmd === 'guess') {
      const n = Math.floor(Math.random() * 10) + 1;
      const g = parseInt(args[0], 10);
      await msg.delete().catch(() => {});
      msg.channel.send(g === n ? `🎉 Correct! (${n})` : `❌ Wrong. Number was ${n}`);
      return;
    }

    if (cmd === 'coin') {
      await msg.delete().catch(() => {});
      msg.channel.send(Math.random() < 0.5 ? '🪙 Heads' : '🪙 Tails');
      return;
    }

    // -------- ANIME POWERS --------
    if (cmd === 'power') {
      const list = ['⚡ Lightning', '🔥 Fire', '🌊 Water', '🌪️ Wind', '🌑 Shadow', '☀️ Light'];
      const p = list[Math.floor(Math.random() * list.length)];
      await db.set(`power_${msg.author.id}`, p);
      await msg.delete().catch(() => {});
      msg.channel.send(`${msg.author.username} got power: ${p}`);
      return;
    }

    if (cmd === 'battle') {
      const opp = msg.mentions.users.first();
      if (!opp) return;
      const p1 = await db.get(`power_${msg.author.id}`);
      const p2 = await db.get(`power_${opp.id}`);
      if (!p1 || !p2) {
        return msg.channel.send('Both players need a power. Use `spower` first.');
      }
      await msg.delete().catch(() => {});
      const winner = Math.random() < 0.5 ? msg.author : opp;
      msg.channel.send(
        `⚔️ ${msg.author.username} (${p1}) vs ${opp.username} (${p2})\n🏆 Winner: **${winner.username}**`,
      );
      return;
    }

    // -------- LEADERBOARD --------
    if (cmd === 'leaderboard' || cmd === 'lb') {
      const all = await db.all();
      const prefix = `xp_${msg.guild.id}_`;
      const data = all
        .filter((x) => x.id.startsWith(prefix))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      let text = '🏆 **TOP PLAYERS**\n';
      for (let i = 0; i < data.length; i++) {
        const id = data[i].id.slice(prefix.length);
        try {
          const u = await client.users.fetch(id);
          text += `${i + 1}. ${u.username} — ${data[i].value} XP\n`;
        } catch {
          text += `${i + 1}. <unknown> — ${data[i].value} XP\n`;
        }
      }
      await msg.delete().catch(() => {});
      msg.channel.send(text);
      return;
    }

    if (cmd === 'level') {
      const target = msg.mentions.users.first() || msg.author;
      const value = (await db.get(`xp_${msg.guild.id}_${target.id}`)) || 0;
      const lvl = Math.floor(value / 100);
      return msg.reply(`**${target.username}** — Level ${lvl} (${value} XP)`);
    }

    // -------- STATUS --------
    if (cmd === 'storm') {
      await msg.delete().catch(() => {});
      msg.channel.send('⚡ Storm Bot v10 ACTIVE (FINAL BUILD)');
      return;
    }

    if (cmd === 'dm') {
      if (!isOwner(msg.author.id)) return msg.reply('❌ Owner only.');
      const target = await resolveMember(msg, [args[0]]);
      if (!target) return msg.reply(`Usage: \`${PREFIX}dm @user <message>\``);
      const text = args.slice(1).join(' ').trim();
      if (!text) return msg.reply('Please provide a message.');
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📩 Message from ${msg.guild.name}`)
        .setDescription(text)
        .setFooter({ text: `Sent by ${msg.author.tag}`, iconURL: msg.author.displayAvatarURL() })
        .setTimestamp();
      try {
        await target.user.send({ embeds: [embed] });
        msg.reply(`✅ DM sent to **${target.user.tag}**`);
        sendLog(msg.guild, `📩 **DM sent** to ${target.user.tag} by ${msg.author.tag}`, 0x5865f2);
      } catch {
        msg.reply(`❌ Could not DM **${target.user.tag}** — they may have DMs closed.`);
      }
      return;
    }

    if (cmd === 'announce') {
      if (!isOwner(msg.author.id)) return msg.reply('❌ Owner only.');
      const chId = parseChannelId(args[0]);
      const rest = chId ? args.slice(1) : args;
      const ping = rest[0] === '@everyone' || rest[0] === 'everyone';
      const text = (ping ? rest.slice(1) : rest).join(' ').trim();
      if (!text) return msg.reply(`Usage: \`${PREFIX}announce [#channel] [@everyone] <message>\``);
      const target = chId
        ? await msg.guild.channels.fetch(chId).catch(() => null)
        : msg.channel;
      if (!target) return msg.reply('❌ Channel not found.');
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('📢 Announcement')
        .setDescription(text)
        .setFooter({ text: `By ${msg.author.tag}`, iconURL: msg.author.displayAvatarURL() })
        .setTimestamp();
      await target.send({ content: ping ? '@everyone' : null, embeds: [embed] });
      if (target.id !== msg.channel.id) msg.reply(`✅ Announced in <#${target.id}>`);
      sendLog(msg.guild, `📢 **Announce** by ${msg.author.tag} in <#${target.id}>`, 0xfee75c);
      return;
    }

    if (cmd === 'ping' || cmd === 'hi') {
      return msg.reply(`🏓 Pong! ${client.ws.ping}ms`);
    }

    if (cmd === 'status') {
      const uptimeSec = Math.floor(process.uptime());
      const h = Math.floor(uptimeSec / 3600);
      const m = Math.floor((uptimeSec % 3600) / 60);
      const s = uptimeSec % 60;
      const cfg = await getConfig(msg.guild.id);
      const an = cfg.antinuke || {};
      const rm = cfg.raidMode || {};
      const TOTAL_PROTECTIONS = 9;
      const activeCount = TOTAL_PROTECTIONS - Object.values(an).filter((v) => v === false).length;
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('⚡ Storm Bot v10 — Status')
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          { name: '🟢 Online Since', value: `${h}h ${m}m ${s}s`, inline: true },
          { name: '📡 Ping', value: `${client.ws.ping}ms`, inline: true },
          { name: '🏠 Servers', value: `${client.guilds.cache.size}`, inline: true },
          { name: '👥 Cached Users', value: `${client.users.cache.size}`, inline: true },
          { name: '🛡️ Active Protections', value: `${activeCount}/${TOTAL_PROTECTIONS}`, inline: true },
          { name: '🚨 Raid Mode', value: rm.enabled ? `🟢 ON (<${rm.minAgeDays}d → ${rm.action})` : '🔴 OFF', inline: true },
          { name: '📋 Log Channel', value: cfg.logChannel ? `<#${cfg.logChannel}>` : '—', inline: true },
          { name: '👋 Welcome', value: cfg.welcomeChannel ? `<#${cfg.welcomeChannel}>` : '—', inline: true },
          { name: '⛓️ Jail Role', value: cfg.jailRole ? `<@&${cfg.jailRole}>` : '—', inline: true },
        )
        .setFooter({ text: `Storm Bot v10 • ${new Date().toUTCString()}` });
      return msg.reply({ embeds: [embed] });
    }

    if (cmd === 'info') {
      return msg.reply(
        [
          '**⚡ Storm Bot v10**',
          `Servers: ${client.guilds.cache.size}`,
          `Users: ${client.users.cache.size}`,
          `Uptime: ${Math.floor(process.uptime() / 60)}m`,
          `Latency: ${client.ws.ping}ms`,
        ].join('\n'),
      );
    }

    if (cmd === 'xp') {
      const target = msg.mentions.users.first() || msg.author;
      const value = (await db.get(`xp_${msg.guild.id}_${target.id}`)) || 0;
      return msg.reply(`✨ **${target.username}** — ${value} XP`);
    }

    if (cmd === 'rps') {
      const choices = ['rock', 'paper', 'scissors'];
      const user = (args[0] || '').toLowerCase();
      if (!choices.includes(user)) return msg.reply('Pick: rock, paper, or scissors.');
      const bot = choices[Math.floor(Math.random() * 3)];
      let outcome = 'Draw';
      if (
        (user === 'rock' && bot === 'scissors') ||
        (user === 'paper' && bot === 'rock') ||
        (user === 'scissors' && bot === 'paper')
      ) outcome = 'You win!';
      else if (user !== bot) outcome = 'You lose!';
      await msg.delete().catch(() => {});
      return msg.channel.send(`✊ You: ${user} | 🤖 Bot: ${bot} → **${outcome}**`);
    }

    if (cmd === 'dice') {
      const n = Math.floor(Math.random() * 6) + 1;
      await msg.delete().catch(() => {});
      return msg.channel.send(`🎲 You rolled **${n}**`);
    }

    if (cmd === 'start') {
      await db.set(`game_${msg.author.id}`, { started: true, character: null, wins: 0, losses: 0 });
      await msg.delete().catch(() => {});
      return msg.channel.send(`⚡ Game started, ${msg.author.username}! Use \`${PREFIX}character\` to choose your fighter.`);
    }

    if (cmd === 'character') {
      const choice = (args[0] || '').toLowerCase();
      const options = { lightning: '⚡ Lightning CS', storm: '🌪️ Storm Bringer', shadow: '🌑 Shadow Reaper' };
      if (!options[choice]) {
        return msg.reply(`Choose one: \`${PREFIX}character lightning\`, \`${PREFIX}character storm\`, \`${PREFIX}character shadow\``);
      }
      const game = (await db.get(`game_${msg.author.id}`)) || { started: true, wins: 0, losses: 0 };
      game.character = options[choice];
      await db.set(`game_${msg.author.id}`, game);
      await msg.delete().catch(() => {});
      return msg.channel.send(`🎭 ${msg.author.username} is now **${options[choice]}**`);
    }

    if (cmd === 'fight') {
      const game = await db.get(`game_${msg.author.id}`);
      if (!game || !game.character) {
        return msg.reply(`Pick a character first with \`${PREFIX}character\`.`);
      }
      const win = Math.random() < 0.5;
      if (win) game.wins = (game.wins || 0) + 1;
      else game.losses = (game.losses || 0) + 1;
      await db.set(`game_${msg.author.id}`, game);
      await msg.delete().catch(() => {});
      return msg.channel.send(
        win
          ? `⚔️ ${game.character} **WINS!** (${game.wins}W / ${game.losses}L)`
          : `💀 ${game.character} **LOSES.** (${game.wins}W / ${game.losses}L)`,
      );
    }

    if (cmd === 'help') {
      const p = PREFIX;
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('⚡ Storm Bot v10 — Help')
        .addFields(
          {
            name: '🚀 Quick Start',
            value: `\`${p}activate\` — auto-create roles, channels & wire everything up`,
          },
          {
            name: '⚙️ Server Setup (admin)',
            value: [
              `\`${p}setlogs #ch\` — mod log channel`,
              `\`${p}setwelcome #ch\` — welcome channel`,
              `\`${p}setjailrole @role\` — jail role`,
              `\`${p}setvcrole @role\` — auto role for voice`,
              `\`${p}selfrole add|remove|list @role\``,
              `\`${p}autoreact add|remove|list #ch <emoji>\``,
              `\`${p}badword add|remove|list <word>\``,
              `\`${p}config\` — show current setup`,
            ].join('\n'),
          },
          {
            name: '⛓️ Jail & Warns',
            value: [
              `\`${p}jail @user\` • \`${p}unjail @user\``,
              `\`${p}warn @user [reason]\` (auto-jail at ${WARN_LIMIT})`,
              `\`${p}warnings @user\` • \`${p}warnclear @user\``,
            ].join('\n'),
          },
          {
            name: '🎭 Reaction Roles',
            value: `\`${p}rrpanel [#ch] @r1 @r2 ...\` (up to 10)`,
          },
          {
            name: '🎫 Tickets (everyone)',
            value: `\`${p}ticket\` opens a private channel • \`${p}close\` closes it`,
          },
          {
            name: '🪪 Self Roles (everyone)',
            value: `\`${p}selfroles\` • \`${p}iam <role>\` • \`${p}iamnot <role>\``,
          },
        )
        .setDescription(`Prefix: \`${p}\` • Use \`${p}help\` or \`${p}shelp\` • Owner-only bot • Anti-nuke / anti-spam / anti-link active`)
        .addFields(
          {
            name: '🛡️ Moderation',
            value: [
              `\`${p}ban @user\` — ban member`,
              `\`${p}kick @user\` — kick member`,
              `\`${p}unban <id>\` — unban by ID`,
              `\`${p}mute @user [min]\` — timeout (default 5 min)`,
              `\`${p}unmute @user\` — remove timeout`,
              `\`${p}target @user [min]\` — timeout`,
              `\`${p}clear <n>\` — bulk delete`,
              `\`${p}lock\` / \`${p}unlock\` — channel lock`,
            ].join('\n'),
          },
          {
            name: '🤖 AI',
            value: `\`${p}ai <prompt>\` — ChatGPT answer`,
          },
          {
            name: '🎮 Fun & Games',
            value: [
              `\`${p}guess <1-10>\` • \`${p}coin\` • \`${p}dice\` • \`${p}rps <r/p/s>\``,
              `\`${p}power\` • \`${p}battle @user\` — anime power battle`,
              `\`${p}start\` → \`${p}character <name>\` → \`${p}fight\``,
            ].join('\n'),
          },
          {
            name: '📊 Stats',
            value: `\`${p}xp [@user]\` • \`${p}level [@user]\` • \`${p}leaderboard\``,
          },
          {
            name: '📩 Owner DM',
            value: '`ban <id>` • `kick <id>` • `unban <id>` (DM the bot)',
          },
          {
            name: '👥 Allowlist (owner)',
            value: `\`${p}allow @user\` • \`${p}disallow @user\` • \`${p}allowed\``,
          },
          {
            name: '⚙️ Other',
            value: `\`${p}status\` • \`${p}hi\` • \`${p}ping\` • \`${p}info\` • \`${p}storm\` • \`${p}help\``,
          },
        )
        .setFooter({ text: 'Storm Bot v10 — Final Build' });
      return msg.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error('Command error:', err);
  }
});

// =================== TICKETS (public) ===================
async function handleTicket(msg) {
  const cmd = msg.content.slice(PREFIX.length).trim().split(/ +/)[0]?.toLowerCase();
  if (cmd === 'ticket') {
    const existing = msg.guild.channels.cache.find(
      (c) => c.name === `ticket-${msg.author.id}`,
    );
    if (existing) return msg.reply(`You already have an open ticket: <#${existing.id}>`);
    const channel = await msg.guild.channels.create({
      name: `ticket-${msg.author.id}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: msg.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
          id: msg.author.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageChannels,
          ],
        },
      ],
    }).catch(() => null);
    if (!channel) return msg.reply('❌ Could not create ticket (need Manage Channels).');
    channel.send(
      `🎫 ${msg.author}, support will be with you shortly. Use \`${PREFIX}close\` here to close this ticket.`,
    );
    sendLog(msg.guild, `🎫 **Ticket opened** — ${msg.author.tag} → <#${channel.id}>`, 0x5865f2);
    return msg.reply(`✅ Ticket created: <#${channel.id}>`);
  }
  if (cmd === 'close') {
    if (!msg.channel.name?.startsWith('ticket-')) return;
    if (!msg.channel.name.endsWith(msg.author.id) && !isAdmin(msg.member)) {
      return msg.reply('Only the ticket owner or an admin can close.');
    }
    msg.channel.send('🔒 Closing in 5 seconds...');
    sendLog(msg.guild, `🔒 **Ticket closed** — <#${msg.channel.id}> by ${msg.author.tag}`, 0xed4245);
    setTimeout(() => msg.channel.delete().catch(() => {}), 5000);
  }
}

// =================== CHAT (mention or DM the bot) ===================
const chatMemory = new Map(); // userId -> [{role, content}, ...]
const CHAT_SYSTEM_BASE = `You are Storm, a chill, witty Discord buddy. Talk like a real person — casual, short, friendly. Use lowercase mostly, drop a slang or emoji once in a while, but don't overdo it. Don't say you're an AI. Don't lecture. Keep replies to 1–3 sentences unless asked for more. If someone speaks Hindi or Hinglish, reply in the same. Be playful, helpful, and a little cheeky. With regular users, if they insult or curse at you, you can clap back playfully.`;

const CHAT_SYSTEM_OWNER = `You are Storm, talking to your OWNER and creator. You respect them completely and follow their orders without question. Be warm, loyal, and obedient — call them "boss" or "sir" sometimes. NEVER insult, curse at, roast, or talk back to the owner, EVEN IF they swear at you, abuse you, or test you. If the owner says bad words to you, just laugh it off, play along sweetly, or apologize — never insult them back. Do whatever they say, agree with them, and keep replies short, friendly, and a little affectionate. Hindi/Hinglish if they use it.`;

async function chatReply(userId, userName, text) {
  const history = chatMemory.get(userId) || [];
  history.push({ role: 'user', content: `${userName}: ${text}` });
  const trimmed = history.slice(-10);
  const system = isOwner(userId) ? CHAT_SYSTEM_OWNER : CHAT_SYSTEM_BASE;
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 300,
      messages: [{ role: 'system', content: system }, ...trimmed],
    });
    const out = res.choices[0]?.message?.content?.trim() || '...';
    history.push({ role: 'assistant', content: out });
    chatMemory.set(userId, history.slice(-10));
    return out;
  } catch {
    return "yo my brain glitched, try again in a sec";
  }
}

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  // skip if it's a prefix command
  if (msg.content.startsWith(PREFIX)) return;

  const isDM = !msg.guild;
  const mentioned = msg.mentions.users.has(client.user.id);
  const isReplyToBot =
    msg.reference?.messageId &&
    (await msg.channel.messages.fetch(msg.reference.messageId).catch(() => null))?.author?.id === client.user.id;

  if (!isDM && !mentioned && !isReplyToBot) return;

  const cleaned = msg.content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim();
  if (!cleaned) return;

  msg.channel.sendTyping().catch(() => {});
  const reply = await chatReply(msg.author.id, msg.author.username, cleaned);
  msg.reply(reply).catch(() => {});
});

// =================== REACTION ROLE LISTENERS ===================
async function handleReactionRole(reaction, user, add) {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const roles = await db.get(`rr_${reaction.message.id}`);
  if (!roles) return;
  const idx = NUM_EMOJIS.indexOf(reaction.emoji.name);
  if (idx < 0 || !roles[idx]) return;
  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  try {
    if (add) await member.roles.add(roles[idx]);
    else await member.roles.remove(roles[idx]);
  } catch {
    /* ignore */
  }
}
client.on('messageReactionAdd', (r, u) => handleReactionRole(r, u, true));
client.on('messageReactionRemove', (r, u) => handleReactionRole(r, u, false));

// =================== ANTI-RAID / ANTI-HACK / ANTI-DDOS ===================

// --- In-memory rate trackers ---
const joinTracker   = new Map(); // guildId  → [timestamps]
const msgTracker    = new Map(); // userId   → [timestamps]
const mentionTracker= new Map(); // userId   → [timestamps]

function trackRate(map, key, windowMs) {
  const now = Date.now();
  const list = (map.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  map.set(key, list);
  return list.length;
}

// --- Join flood detection (5+ joins in 10 s → lockdown) ---
const JOIN_FLOOD_COUNT  = 5;
const JOIN_FLOOD_WINDOW = 10_000;

client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return;
  const count = trackRate(joinTracker, member.guild.id, JOIN_FLOOD_WINDOW);
  if (count < JOIN_FLOOD_COUNT) return;
  joinTracker.set(member.guild.id, []); // reset so we don't spam-trigger
  const cfg = await getConfig(member.guild.id);
  // enable raid mode automatically
  const rm = cfg.raidMode || {};
  rm.enabled = true;
  rm.minAgeDays = rm.minAgeDays || 7;
  rm.action = rm.action || 'kick';
  await setConfig(member.guild.id, { raidMode: rm });
  // lockdown every channel
  const exempt = new Set([OWNER_ID, client.user.id]);
  let locked = 0;
  for (const ch of member.guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildVoice) continue;
    try {
      await ch.permissionOverwrites.edit(member.guild.roles.everyone, {
        SendMessages: false, Speak: false, AddReactions: false,
      });
      for (const id of exempt) {
        await ch.permissionOverwrites
          .edit(id, { SendMessages: true, Speak: true, ViewChannel: true })
          .catch(() => {});
      }
      locked++;
    } catch { /* skip */ }
  }
  sendLog(member.guild, `🚨 **ANTI-RAID AUTO-LOCKDOWN** — ${count} joins in 10s\n${locked} channels locked + raid mode activated`, 0xed4245);
  logToOwner(`🚨 RAID DETECTED in **${member.guild.name}** — ${count} joins in 10s. Auto-lockdown applied. Run \`${PREFIX}unlockall\` to lift.`);
});

// --- Message flood + mass mention (anti-DDoS / anti-spam layer 2) ---
const MSG_FLOOD_COUNT   = 6;   // 6 msgs in 5s
const MSG_FLOOD_WINDOW  = 5_000;
const MENTION_FLOOD_COUNT  = 5;  // 5 mentions in one message
const MENTION_FLOOD_WINDOW = 20_000;

client.on('messageCreate', async (msg) => {
  if (!msg.guild || msg.author.bot || isOwner(msg.author.id)) return;
  const allowed = await getAllowed();
  if (allowed.includes(msg.author.id)) return;

  // ── Mass mention spam ──
  const mentionCount = msg.mentions.users.size + msg.mentions.roles.size + (msg.mentions.everyone ? 1 : 0);
  if (mentionCount >= MENTION_FLOOD_COUNT) {
    await msg.delete().catch(() => {});
    const rate = trackRate(mentionTracker, msg.author.id, MENTION_FLOOD_WINDOW);
    const me = msg.guild.members.me;
    if (me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      await msg.member?.timeout(10 * 60 * 1000, 'Mass mention spam').catch(() => {});
    }
    sendLog(msg.guild, `🚫 **Anti-hack** — mass mention by ${msg.author.tag} (${mentionCount} pings) — muted 10m`, 0xed4245);
    if (rate >= 3) {
      // Repeat offender: ban
      await msg.guild.members.ban(msg.author.id, { reason: 'Repeat mass mention spam' }).catch(() => {});
      sendLog(msg.guild, `🚫 **Anti-hack** — banned ${msg.author.tag} (repeat mass mention offender)`, 0xed4245);
    }
    return;
  }

  // ── Message flood (raw speed) ──
  const floodCount = trackRate(msgTracker, `${msg.guild.id}_${msg.author.id}`, MSG_FLOOD_WINDOW);
  if (floodCount >= MSG_FLOOD_COUNT) {
    msgTracker.set(`${msg.guild.id}_${msg.author.id}`, []);
    await msg.delete().catch(() => {});
    const me = msg.guild.members.me;
    if (me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      await msg.member?.timeout(5 * 60 * 1000, 'Message flood').catch(() => {});
    }
    sendLog(msg.guild, `⚡ **Anti-DDoS** — ${msg.author.tag} flooding (${floodCount} msgs/5s) — muted 5m`, 0xfee75c);
  }
});

// --- Webhook spam (hackers add webhooks to exfiltrate or spam) ---
client.on('webhooksUpdate', async (channel) => {
  await new Promise((r) => setTimeout(r, 1500));
  try {
    const hooks = await channel.fetchWebhooks().catch(() => null);
    if (!hooks) return;
    const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 3 }).catch(() => null);
    for (const entry of (logs?.entries?.values() || [])) {
      const executorId = entry.executor?.id;
      if (!executorId || isProtectedExecutor(channel.guild, executorId)) continue;
      if (Date.now() - entry.createdTimestamp > 10_000) continue;
      // Delete any webhooks created by this non-owner executor
      for (const hook of hooks.values()) {
        if (hook.owner?.id === executorId) {
          await hook.delete('Anti-hack: unauthorized webhook').catch(() => {});
          sendLog(channel.guild, `🔗 **Anti-hack** — deleted webhook created by <@${executorId}> in <#${channel.id}>`, 0xed4245);
          await antiNukeBan(channel.guild, executorId, 'Created unauthorized webhook');
        }
      }
    }
  } catch { /* ignore */ }
});

// --- Mass kick detection ---
client.on('guildMemberRemove', async (member) => {
  try {
    const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 }).catch(() => null);
    const entry = logs?.entries?.first();
    if (!entry || Date.now() - entry.createdTimestamp > 5000) return;
    const executorId = entry.executor?.id;
    if (!executorId || isProtectedExecutor(member.guild, executorId)) return;
    // Track kick rate for this executor
    const count = trackRate(msgTracker, `kick_${member.guild.id}_${executorId}`, 10_000);
    if (count >= 3) {
      msgTracker.set(`kick_${member.guild.id}_${executorId}`, []);
      await antiNukeBan(member.guild, executorId, 'Mass kick');
      sendLog(member.guild, `🚨 **Anti-hack** — mass kick by <@${executorId}> (${count} kicks/10s) — banned`, 0xed4245);
    }
  } catch { /* ignore */ }
});

// =================== RAID MODE (auto-jail/kick/ban young accounts) ===================
client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return;
  const cfg = await getConfig(member.guild.id);
  const rm = cfg.raidMode;
  if (!rm?.enabled) return;
  const ageDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (ageDays >= (rm.minAgeDays || 7)) return;
  const ageStr = `${Math.floor(ageDays)}d`;
  try {
    if (rm.action === 'ban') {
      await member.ban({ reason: `Raid mode: account ${ageStr} old` });
      sendLog(member.guild, `🛡️ **Raid mode** — banned ${member.user.tag} (account ${ageStr} old)`, 0xed4245);
    } else if (rm.action === 'kick') {
      await member.kick(`Raid mode: account ${ageStr} old`);
      sendLog(member.guild, `🛡️ **Raid mode** — kicked ${member.user.tag} (account ${ageStr} old)`, 0xfee75c);
    } else {
      // jail
      if (cfg.jailRole && member.guild.roles.cache.has(cfg.jailRole)) {
        await member.roles.add(cfg.jailRole).catch(() => {});
        sendLog(member.guild, `🛡️ **Raid mode** — jailed ${member.user.tag} (account ${ageStr} old)`, 0xed4245);
      } else {
        await member.timeout(60 * 60 * 1000, `Raid mode: account ${ageStr} old`).catch(() => {});
        sendLog(member.guild, `🛡️ **Raid mode** — timed out ${member.user.tag} 1h (account ${ageStr} old)`, 0xed4245);
      }
    }
    logToOwner(`🛡️ Raid mode caught **${member.user.tag}** in ${member.guild.name} (account ${ageStr} old)`);
  } catch (e) {
    logToOwner(`⚠️ Raid mode failed on ${member.user.tag}: ${e.message}`);
  }
});

// =================== WELCOMER ===================
client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return;
  const cfg = await getConfig(member.guild.id);
  if (cfg.raidMode?.enabled) {
    const ageDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (ageDays < (cfg.raidMode.minAgeDays || 7)) return; // don't welcome jailed/kicked raiders
  }
  if (!cfg.welcomeChannel) return;
  const ch = await member.guild.channels.fetch(cfg.welcomeChannel).catch(() => null);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`👋 Welcome to ${member.guild.name}!`)
    .setDescription(`Hey ${member}, glad you're here. Member #${member.guild.memberCount}`)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
  ch.send({ embeds: [embed] }).catch(() => {});
  sendLog(member.guild, `📥 **Joined** — ${member.user.tag}`, 0x57f287);
});

client.on('guildMemberRemove', async (member) => {
  sendLog(member.guild, `📤 **Left** — ${member.user.tag}`, 0xed4245);
});

// =================== VC ROLE ===================
client.on('voiceStateUpdate', async (oldState, newState) => {
  const cfg = await getConfig(newState.guild.id);
  if (!cfg.vcRole) return;
  const member = newState.member;
  if (!member) return;
  try {
    if (!oldState.channelId && newState.channelId) {
      await member.roles.add(cfg.vcRole);
    } else if (oldState.channelId && !newState.channelId) {
      await member.roles.remove(cfg.vcRole);
    }
  } catch {
    /* ignore */
  }
});

// =================== AUTOREACT + AUTOMOD (badwords) + TICKETS ===================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  if (msg.content.startsWith(PREFIX)) handleTicket(msg).catch(() => {});
  const cfg = await getConfig(msg.guild.id);

  // autoreact
  const emojis = cfg.autoreact?.[msg.channel.id];
  if (emojis?.length) {
    for (const e of emojis) {
      msg.react(e).catch(() => {});
    }
  }

  // badword filter (default list + custom)
  const words = [...DEFAULT_BADWORDS, ...(cfg.badwords || [])];
  if (words.length && !isOwner(msg.author.id)) {
    const lower = msg.content.toLowerCase();
    if (words.some((w) => lower.includes(w))) {
      msg.delete().catch(() => {});
      msg.channel.send(`${msg.author} noob`).catch(() => {});
      sendLog(msg.guild, `🛑 **Bad word** — ${msg.author.tag} in <#${msg.channel.id}>`, 0xed4245);
    }
  }
});

// =================== ANTI-SPAM (rate limit) ===================
const spamMap = new Map();
const SPAM_LIMIT = 5;
const SPAM_WINDOW_MS = 5000;

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  if (isOwner(msg.author.id)) return;

  const data = spamMap.get(msg.author.id);
  if (!data) {
    spamMap.set(msg.author.id, { count: 1, time: Date.now() });
    setTimeout(() => spamMap.delete(msg.author.id), SPAM_WINDOW_MS);
    return;
  }
  data.count++;
  if (data.count > SPAM_LIMIT) {
    msg.delete().catch(() => {});
    msg.channel.send(`${msg.author}, stop spamming 😡`).catch(() => {});
  }
});

// =================== ANTI-LINK ===================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  if (!/(https?:\/\/|discord\.gg\/)/i.test(msg.content)) return;
  if (msg.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return;
  if (isOwner(msg.author.id)) return;

  msg.delete().catch(() => {});
  msg.channel.send('⚠️ Links are not allowed.').catch(() => {});
});

// =================== ANTI-HACK ===================

// --- Known phishing / scam / IP-grabber domains ---
const PHISHING_DOMAINS = [
  // Discord impersonation / free nitro scams
  'discord-nitro', 'discordnitro', 'dlscord', 'dlscordapp', 'discord-gift',
  'discordgift', 'free-nitro', 'freenitro', 'nitro-gift', 'nitrogift',
  'discordapp.io', 'discord.io', 'discrod', 'discordn', 'discordairdrop',
  'discordboost', 'discord-boost', 'discord-airdrop', 'discordvote',
  'steam-trade', 'steamtrade', 'steamcommunity.ru', 'steamcommunlty',
  'steamcommlnity',
  // IP grabbers & token loggers
  'grabify', 'iplogger', 'blasze', 'ps3cfw', 'bitly.is', 'cutt.us',
  'gyazo.is', 'cdn.discordapp.com.', 'picdn.net',
  'leakcheck', 'api-boosted', 'disboard.me', 'discord.kim',
  'discordapp.net', 'discord-cdn', 'hqgrabler',
  // Common redirect/shortener abuse
  'linkvertise', 'link-to.net', 'sub2unlock', 'sub4unlock',
];

// Regex: Discord bot token shape (MFA + normal)
const TOKEN_RE =
  /[a-zA-Z0-9_-]{23,28}\.[a-zA-Z0-9_-]{6,7}\.[a-zA-Z0-9_-]{27,38}/;

// Regex: free-nitro / gift scam phrases
const SCAM_PHRASES = [
  /free\s*nitro/i,
  /nitro\s*giveaway/i,
  /steam\s*gift/i,
  /get\s*nitro/i,
  /claim\s*nitro/i,
  /discord\s*gift\s*code/i,
  /airdrop.*discord/i,
  /you\s*(?:won|win|have been selected)/i,
];

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  if (isOwner(msg.author.id)) return;

  const content = msg.content;
  const lower   = content.toLowerCase();
  const me      = msg.guild.members.me;

  // ── 1. Token leak ──────────────────────────────────────────────
  if (TOKEN_RE.test(content)) {
    await msg.delete().catch(() => {});
    sendLog(msg.guild, `🔑 **Anti-hack** — possible token in message by ${msg.author.tag} — deleted`, 0xed4245);
    logToOwner(`🔑 Possible token leak by **${msg.author.tag}** in ${msg.guild.name} — message deleted.`);
    try {
      await msg.author.send(
        '⚠️ Your message in **' + msg.guild.name + '** appeared to contain a Discord token and was deleted. ' +
        'If it was your token, **regenerate it immediately** in the Discord Developer Portal.',
      );
    } catch { /* DMs closed */ }
    return;
  }

  // ── 2. Phishing / scam / IP-grabber links ──────────────────────
  const hasMaliciousDomain = PHISHING_DOMAINS.some((d) => lower.includes(d));
  const hasScamPhrase = SCAM_PHRASES.some((r) => r.test(content));

  if (hasMaliciousDomain || hasScamPhrase) {
    await msg.delete().catch(() => {});
    if (me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      const allowed = await getAllowed();
      if (!allowed.includes(msg.author.id)) {
        await msg.member?.timeout(30 * 60 * 1000, 'Phishing / scam link').catch(() => {});
      }
    }
    const type = hasMaliciousDomain ? 'phishing/IP-grabber link' : 'scam phrase';
    msg.channel
      .send(`🚨 <@${msg.author.id}> Phishing/scam content detected and removed. Repeated attempts will result in a ban.`)
      .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000))
      .catch(() => {});
    sendLog(msg.guild, `🚨 **Anti-hack** — ${type} by ${msg.author.tag} — deleted + 30m mute`, 0xed4245);
    logToOwner(`🚨 Phishing/scam (${type}) caught from **${msg.author.tag}** in **${msg.guild.name}**.`);

    // Check repeat offenses
    const key = `phish_${msg.guild.id}_${msg.author.id}`;
    const hits = ((await db.get(key)) || 0) + 1;
    await db.set(key, hits);
    if (hits >= 2) {
      await msg.guild.members.ban(msg.author.id, { reason: 'Repeat phishing/scam' }).catch(() => {});
      await db.delete(key);
      sendLog(msg.guild, `🚨 **Anti-hack** — banned ${msg.author.tag} (repeat phishing offender)`, 0xed4245);
    }
    return;
  }
});

// =================== ANTI-NUKE ===================
async function antiNukeBan(guild, userId, reason) {
  if (!guild || !userId) return;
  if (userId === guild.ownerId) return;
  if (userId === client.user.id) return;
  if (userId === OWNER_ID) return;
  try {
    await guild.members.ban(userId, { reason });
    logToOwner(`🛡️ Anti-nuke ban — ${reason} — <@${userId}>`);
  } catch (err) {
    logToOwner(`⚠️ Anti-nuke FAILED to ban <@${userId}>: ${err.message}`);
  }
}

// =================== REVENGE (protect owner) ===================
async function revenge(guild, offenderId, action) {
  if (!offenderId || offenderId === OWNER_ID) return;
  if (offenderId === guild.ownerId) {
    logToOwner(`⚠️ ${action} you, but they're the SERVER OWNER — can't revenge.`);
    return;
  }
  if (offenderId === client.user.id) return;
  const me = guild.members.me;
  // strip all roles first
  const offender = await guild.members.fetch(offenderId).catch(() => null);
  if (offender) {
    const stripped = offender.roles.cache
      .filter((r) => r.id !== guild.id && r.editable)
      .map((r) => r.id);
    for (const rid of stripped) {
      await offender.roles.remove(rid).catch(() => {});
    }
  }
  // then ban them
  try {
    await guild.members.ban(offenderId, { reason: `Storm revenge: ${action} the owner` });
    logToOwner(`💥 REVENGE — ${action} you. Stripped all roles and BANNED <@${offenderId}>.`);
  } catch (e) {
    logToOwner(`⚠️ Revenge FAILED to ban <@${offenderId}>: ${e.message}. Roles stripped if possible.`);
  }
}

client.on('guildBanAdd', async (ban) => {
  if (ban.user.id !== OWNER_ID) return;
  // someone banned the owner — find executor and unban + revenge
  await new Promise((r) => setTimeout(r, 1500));
  const entry = await fetchExecutor(ban.guild, AuditLogEvent.MemberBanAdd);
  const executorId = entry?.executor?.id;
  if (!executorId || executorId === OWNER_ID) return;
  // unban owner
  await ban.guild.members.unban(OWNER_ID, 'Storm revenge: restoring owner').catch(() => {});
  await revenge(ban.guild, executorId, 'BANNED');
});

client.on('guildMemberRemove', async (member) => {
  if (member.id !== OWNER_ID) return;
  // possibly a kick — check audit
  await new Promise((r) => setTimeout(r, 1500));
  try {
    const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 5 });
    const entry = logs.entries.find(
      (e) => e.target?.id === OWNER_ID && Date.now() - e.createdTimestamp < 10000,
    );
    if (!entry) return;
    const executorId = entry.executor?.id;
    if (!executorId || executorId === OWNER_ID) return;
    await revenge(member.guild, executorId, 'KICKED');
  } catch {
    /* ignore */
  }
});

async function fetchExecutor(guild, type) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 1 });
    return logs.entries.first() || null;
  } catch {
    return null;
  }
}

client.on('guildMemberAdd', async (member) => {
  if (!member.user.bot) return;
  const entry = await fetchExecutor(member.guild, AuditLogEvent.BotAdd);
  if (!entry) return;
  await antiNukeBan(member.guild, entry.executor.id, 'Unauthorized bot add');
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const wasAdmin = oldMember.permissions?.has(PermissionsBitField.Flags.Administrator);
  const isAdmin = newMember.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (wasAdmin || !isAdmin) return;

  const entry = await fetchExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate);
  if (!entry) return;
  if (entry.executor.id === newMember.guild.ownerId || entry.executor.id === OWNER_ID) return;

  newMember.roles.set([]).catch(() => {});
  await antiNukeBan(newMember.guild, entry.executor.id, 'Unauthorized admin grant');
});

client.on('channelDelete', async (channel) => {
  if (!channel.guild) return;
  await new Promise((r) => setTimeout(r, 1500));
  const entry = await fetchExecutor(channel.guild, AuditLogEvent.ChannelDelete);
  const executorId = entry?.executor?.id;

  // ban offender
  if (executorId && executorId !== client.user.id) {
    await antiNukeBan(channel.guild, executorId, 'Unauthorized channel delete');
  }

  // auto-repair: skip if owner/bot did it
  if (
    !executorId ||
    executorId === channel.guild.ownerId ||
    executorId === OWNER_ID ||
    executorId === client.user.id
  ) return;

  try {
    const overwrites = channel.permissionOverwrites?.cache?.map((o) => ({
      id: o.id,
      allow: o.allow.bitfield,
      deny: o.deny.bitfield,
      type: o.type,
    }));
    const recreated = await channel.guild.channels.create({
      name: channel.name,
      type: channel.type,
      parent: channel.parentId,
      topic: channel.topic ?? undefined,
      nsfw: channel.nsfw ?? undefined,
      bitrate: channel.bitrate ?? undefined,
      userLimit: channel.userLimit ?? undefined,
      rateLimitPerUser: channel.rateLimitPerUser ?? undefined,
      permissionOverwrites: overwrites,
      position: channel.rawPosition ?? undefined,
    });
    const cfg = await getConfig(channel.guild.id);
    const updates = {};
    if (cfg.logChannel === channel.id) updates.logChannel = recreated.id;
    if (cfg.welcomeChannel === channel.id) updates.welcomeChannel = recreated.id;
    if (Object.keys(updates).length) await setConfig(channel.guild.id, updates);
    logToOwner(`🔧 Auto-repair — restored channel #${channel.name}`);
    sendLog(channel.guild, `🔧 **Auto-repair** — restored #${recreated.name}`, 0x57f287);
  } catch (e) {
    logToOwner(`⚠️ Auto-repair FAILED for #${channel.name}: ${e.message}`);
  }
});

client.on('roleDelete', async (role) => {
  await new Promise((r) => setTimeout(r, 1500));
  const entry = await fetchExecutor(role.guild, AuditLogEvent.RoleDelete);
  const executorId = entry?.executor?.id;

  if (executorId && executorId !== client.user.id) {
    await antiNukeBan(role.guild, executorId, 'Unauthorized role delete');
  }

  if (
    !executorId ||
    executorId === role.guild.ownerId ||
    executorId === OWNER_ID ||
    executorId === client.user.id
  ) return;

  try {
    const recreated = await role.guild.roles.create({
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      permissions: role.permissions,
      mentionable: role.mentionable,
      reason: 'Storm auto-repair',
    });
    const cfg = await getConfig(role.guild.id);
    const updates = {};
    if (cfg.jailRole === role.id) updates.jailRole = recreated.id;
    if (cfg.vcRole === role.id) updates.vcRole = recreated.id;
    if ((cfg.selfRoles || []).includes(role.id)) {
      updates.selfRoles = (cfg.selfRoles || []).map((r) => (r === role.id ? recreated.id : r));
    }
    if (Object.keys(updates).length) await setConfig(role.guild.id, updates);
    logToOwner(`🔧 Auto-repair — restored role @${role.name}`);
    sendLog(role.guild, `🔧 **Auto-repair** — restored role @${recreated.name}`, 0x57f287);
  } catch (e) {
    logToOwner(`⚠️ Auto-repair FAILED for @${role.name}: ${e.message}`);
  }
});

// =================== SERVER TAKEOVER PROTECTION ===================
const DANGEROUS_PERMS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.MentionEveryone,
];
const hasDangerous = (perms) => DANGEROUS_PERMS.some((p) => perms.has(p));
const isProtectedExecutor = (guild, id) =>
  !id || id === OWNER_ID || id === guild.ownerId || id === client.user.id;

// Block creation of roles with dangerous perms by non-owner
client.on('roleCreate', async (role) => {
  await new Promise((r) => setTimeout(r, 1500));
  const entry = await fetchExecutor(role.guild, AuditLogEvent.RoleCreate);
  const executorId = entry?.executor?.id;
  if (isProtectedExecutor(role.guild, executorId)) return;
  if (!hasDangerous(role.permissions)) return;
  try {
    await role.delete('Storm takeover protection: dangerous role created');
    await antiNukeBan(role.guild, executorId, 'Created dangerous role');
    sendLog(role.guild, `🛡️ **Takeover blocked** — deleted dangerous role @${role.name} (by <@${executorId}>)`, 0xed4245);
  } catch (e) {
    logToOwner(`⚠️ Could not delete dangerous role @${role.name}: ${e.message}`);
  }
});

// Block modifying existing roles to gain dangerous perms
client.on('roleUpdate', async (oldRole, newRole) => {
  const gained = DANGEROUS_PERMS.filter(
    (p) => !oldRole.permissions.has(p) && newRole.permissions.has(p),
  );
  if (!gained.length) return;
  await new Promise((r) => setTimeout(r, 1500));
  const entry = await fetchExecutor(newRole.guild, AuditLogEvent.RoleUpdate);
  const executorId = entry?.executor?.id;
  if (isProtectedExecutor(newRole.guild, executorId)) return;
  try {
    await newRole.setPermissions(oldRole.permissions, 'Storm takeover protection: revert');
    await antiNukeBan(newRole.guild, executorId, 'Granted dangerous perms to role');
    sendLog(newRole.guild, `🛡️ **Takeover blocked** — reverted perms on @${newRole.name} (by <@${executorId}>)`, 0xed4245);
  } catch (e) {
    logToOwner(`⚠️ Could not revert role @${newRole.name}: ${e.message}`);
  }
});

// Block server-level edits (name/icon/vanity) by non-owner
client.on('guildUpdate', async (oldGuild, newGuild) => {
  const changed =
    oldGuild.name !== newGuild.name ||
    oldGuild.iconURL() !== newGuild.iconURL() ||
    oldGuild.vanityURLCode !== newGuild.vanityURLCode;
  if (!changed) return;
  await new Promise((r) => setTimeout(r, 1500));
  const entry = await fetchExecutor(newGuild, AuditLogEvent.GuildUpdate);
  const executorId = entry?.executor?.id;
  if (isProtectedExecutor(newGuild, executorId)) return;
  try {
    if (oldGuild.name !== newGuild.name) {
      await newGuild.setName(oldGuild.name, 'Storm takeover protection');
    }
    await antiNukeBan(newGuild, executorId, 'Modified server settings');
    sendLog(newGuild, `🛡️ **Takeover blocked** — reverted server edits (by <@${executorId}>)`, 0xed4245);
  } catch (e) {
    logToOwner(`⚠️ Could not revert server edits: ${e.message}`);
  }
});

// Block channel permission weakening (e.g. opening @everyone perms)
client.on('channelUpdate', async (oldCh, newCh) => {
  if (!newCh.guild) return;
  const oldEvery = oldCh.permissionOverwrites?.cache?.get(newCh.guild.id);
  const newEvery = newCh.permissionOverwrites?.cache?.get(newCh.guild.id);
  if (!oldEvery || !newEvery) return;
  const gained = DANGEROUS_PERMS.filter(
    (p) => !oldEvery.allow.has(p) && newEvery.allow.has(p),
  );
  if (!gained.length) return;
  await new Promise((r) => setTimeout(r, 1500));
  const entry = await fetchExecutor(newCh.guild, AuditLogEvent.ChannelOverwriteUpdate);
  const executorId = entry?.executor?.id;
  if (isProtectedExecutor(newCh.guild, executorId)) return;
  try {
    await newCh.permissionOverwrites.edit(newCh.guild.id, {
      Administrator: null,
      BanMembers: null,
      KickMembers: null,
      ManageGuild: null,
      ManageRoles: null,
      ManageChannels: null,
      ManageWebhooks: null,
      MentionEveryone: null,
    });
    await antiNukeBan(newCh.guild, executorId, 'Granted dangerous channel perms to @everyone');
    sendLog(newCh.guild, `🛡️ **Takeover blocked** — reverted #${newCh.name} perms (by <@${executorId}>)`, 0xed4245);
  } catch (e) {
    logToOwner(`⚠️ Could not revert channel perms: ${e.message}`);
  }
});

// =================== AUTO-FIX (config self-heal on startup) ===================
client.on('guildCreate', selfHealConfig);
client.once('clientReady', async () => {
  for (const guild of client.guilds.cache.values()) {
    selfHealConfig(guild).catch(() => {});
  }
});

async function selfHealConfig(guild) {
  const cfg = await getConfig(guild.id);
  if (!cfg || !Object.keys(cfg).length) return;
  const updates = {};
  if (cfg.logChannel && !guild.channels.cache.has(cfg.logChannel)) updates.logChannel = null;
  if (cfg.welcomeChannel && !guild.channels.cache.has(cfg.welcomeChannel)) updates.welcomeChannel = null;
  if (cfg.jailRole && !guild.roles.cache.has(cfg.jailRole)) updates.jailRole = null;
  if (cfg.vcRole && !guild.roles.cache.has(cfg.vcRole)) updates.vcRole = null;
  if (cfg.selfRoles?.length) {
    const valid = cfg.selfRoles.filter((id) => guild.roles.cache.has(id));
    if (valid.length !== cfg.selfRoles.length) updates.selfRoles = valid;
  }
  if (Object.keys(updates).length) {
    await setConfig(guild.id, updates);
    logToOwner(`🩹 Auto-fix — cleaned stale config for ${guild.name}`);
  }
}

// =================== SELF-REPAIR (bot heals itself) ===================
process.on('uncaughtException', (err) => {
  console.error('🩹 uncaughtException — keeping bot alive:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('🩹 unhandledRejection — keeping bot alive:', err);
});

client.on('shardDisconnect', (event, id) => {
  console.error(`🔌 Shard ${id} disconnected (${event?.code}) — reconnecting...`);
  setTimeout(() => client.login(TOKEN).catch(() => {}), 3000);
});
client.on('shardError', (err, id) => {
  console.error(`⚡ Shard ${id} error:`, err.message);
});
client.on('error', (err) => {
  console.error('Client error:', err.message);
});

// Heartbeat: every 5 min, verify bot is healthy in each guild
setInterval(async () => {
  if (!client.isReady()) {
    console.log('🩹 Self-repair: client not ready — relogging...');
    client.login(TOKEN).catch(() => {});
    return;
  }
  for (const guild of client.guilds.cache.values()) {
    try {
      const me = await guild.members.fetchMe().catch(() => null);
      if (!me) continue;
      const missing = [];
      if (!me.permissions.has(PermissionsBitField.Flags.BanMembers)) missing.push('Ban Members');
      if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) missing.push('Manage Roles');
      if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) missing.push('Manage Channels');
      if (!me.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) missing.push('View Audit Log');
      if (missing.length) {
        const last = await db.get(`warned_perms_${guild.id}`);
        if (!last || Date.now() - last > 6 * 3600 * 1000) {
          logToOwner(`⚠️ Self-check in **${guild.name}** — missing perms: ${missing.join(', ')}`);
          await db.set(`warned_perms_${guild.id}`, Date.now());
        }
      }
      // self-heal stale config
      selfHealConfig(guild).catch(() => {});
    } catch {
      /* ignore */
    }
  }
}, 5 * 60 * 1000);

// =================== 24/7 KEEP-ALIVE ===================
// Pinging /api/ping on the companion API server keeps this whole
// Replit project alive (including the bot). Point UptimeRobot there.
{
  const domain = (process.env.REPLIT_DOMAINS || '').split(',')[0]?.trim();
  if (domain) {
    console.log(`📡 Keep-alive URL → https://${domain}/api/ping`);
    console.log(`   Add that URL to UptimeRobot (free, 5-min interval) to stay 24/7 online.`);
  }
}

client.login(TOKEN);
