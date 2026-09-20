const crypto = require('node:crypto');
const { supabaseAdmin } = require('../config/supabase');
const { sendVerificationCode } = require('../services/email.service');

const OTP_TTL_MS = 10 * 60 * 1000;
const otpHash = (code) => crypto.createHash('sha256').update(`${code}:${process.env.OTP_PEPPER || 'autolister-otp'}`).digest('hex');
const newOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const response = (res, status, data = null, error = null) => res.status(status).json({ success: !error, data, error });

async function saveOtp(userId, email, name) {
  const code = newOtp();
  const { error } = await supabaseAdmin.from('users').update({ is_verified: false, otp_code: otpHash(code), otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString() }).eq('id', userId);
  if (error) throw error;
  await sendVerificationCode({ to: email, code, name });
}

exports.register = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const fullName = String(req.body?.fullName || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || fullName.length < 3) return response(res, 400, null, 'Name, gültige E-Mail und ein Passwort mit mindestens 8 Zeichen sind erforderlich.');
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: false, user_metadata: { full_name: fullName } });
    if (error || !data.user) return response(res, 400, null, 'Registrierung konnte nicht abgeschlossen werden.');
    await saveOtp(data.user.id, email, fullName);
    return response(res, 201, { email, expiresInSeconds: OTP_TTL_MS / 1000 });
  } catch (error) { return response(res, error.status || 500, null, error.status ? error.message : 'Registrierung derzeit nicht verfügbar.'); }
};

exports.verifyOtp = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(code) || !email) return response(res, 400, null, 'Bitte einen gültigen 6-stelligen Code eingeben.');
    const { data: profile, error } = await supabaseAdmin.from('users').select('id,email,otp_code,otp_expires_at').eq('email', email).maybeSingle();
    if (!profile) return response(res, 400, null, 'Code oder E-Mail ist ungültig.');
    const expected = otpHash(code);
    if (error || !profile || !profile.otp_code || !profile.otp_expires_at || new Date(profile.otp_expires_at).getTime() < Date.now() || profile.otp_code.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(profile.otp_code), Buffer.from(expected))) return response(res, 400, null, 'Code ist falsch oder abgelaufen.');
    const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, { email_confirm: true });
    if (confirmError) throw confirmError;
    const { error: updateError } = await supabaseAdmin.from('users').update({ is_verified: true, otp_code: null, otp_expires_at: null }).eq('id', profile.id);
    if (updateError) throw updateError;
    return response(res, 200, { verified: true, email });
  } catch (error) { return response(res, 500, null, 'Verifizierung derzeit nicht verfügbar.'); }
};

exports.resendOtp = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const { data: profile } = await supabaseAdmin.from('users').select('id,email,is_verified').eq('email', email).maybeSingle();
    if (!profile) return response(res, 200, { sent: true });
    if (profile.is_verified) return response(res, 400, null, 'Dieses Konto ist bereits bestätigt.');
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    await saveOtp(profile.id, email, authUser.user?.user_metadata?.full_name);
    return response(res, 200, { sent: true, expiresInSeconds: OTP_TTL_MS / 1000 });
  } catch (error) { return response(res, error.status || 500, null, error.status ? error.message : 'Code konnte nicht erneut gesendet werden.'); }
};

exports.google = async (req, res) => response(res, 200, { provider: 'google' });

module.exports = exports;
