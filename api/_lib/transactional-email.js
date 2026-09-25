function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function shell({ preheader, title, body }) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#f6f5fa;color:#27243a;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f5fa;padding:30px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e9e5f0;border-radius:18px;overflow:hidden"><tr><td style="padding:24px 30px;border-bottom:1px solid #eeeaf4;font-weight:800;letter-spacing:.04em">JL STUDIO <span style="color:#6957cf">WEB</span><span style="float:right;color:#777187;font-size:12px;font-weight:600">DIJON · BOURGOGNE</span></td></tr><tr><td style="padding:30px">${body}<p style="margin:28px 0 0;color:#68647a">À bientôt,<br><strong>Jérôme — JL Studio Web</strong></p></td></tr><tr><td style="padding:17px 30px;background:#faf9fc;color:#858092;font-size:12px">JL Studio Web · 27 boulevard de l’Université · 21000 Dijon<br><a style="color:#6957cf" href="mailto:jerome.lopes21@gmail.com">jerome.lopes21@gmail.com</a> · 06 67 03 66 61</td></tr></table></td></tr></table></body></html>`;
}

function receivedEmail(brief) {
  const name = escapeHtml(brief.contact_name || 'Bonjour');
  const company = escapeHtml(brief.company_name || 'votre activité');
  const html = shell({
    preheader: 'Votre demande est bien reçue. Votre premier aperçu est en préparation.',
    title: 'Votre demande est bien reçue',
    body: `<p style="margin:0 0 8px;color:#6957cf;font-weight:800;font-size:12px;letter-spacing:.12em">VOTRE PROJET COMMENCE</p><h1 style="margin:0 0 14px;font-size:27px;line-height:1.2">${name}, votre demande est bien reçue.</h1><p style="color:#615d72;line-height:1.7">J’ai bien reçu votre questionnaire pour <strong>${company}</strong>. Je vais étudier vos réponses et préparer une première maquette de votre site vitrine.</p><div style="margin:20px 0;padding:16px 18px;border-radius:12px;background:#f5f3ff;color:#47415f;line-height:1.65"><strong>Vous recevrez un nouvel e-mail avec votre lien de prévisualisation dans un délai maximum de 48 heures.</strong> Ce premier aperçu est gratuit et sans engagement. Si sa préparation nécessite un délai exceptionnel, je vous tiendrai informé.</div><p style="color:#615d72;line-height:1.7">Après réception, vous pourrez consulter la maquette, demander des ajustements jusqu’à ce qu’elle corresponde à vos attentes, puis choisir la formule adaptée. Aucun paiement n’est demandé à cette étape.</p>`
  });
  const text = `Bonjour ${brief.contact_name || ''},\n\nJ’ai bien reçu votre questionnaire pour ${brief.company_name || 'votre activité'}. Je vais étudier vos réponses et préparer une première maquette de votre site vitrine.\n\nVous recevrez un nouvel e-mail avec votre lien de prévisualisation dans un délai maximum de 48 heures. Ce premier aperçu est gratuit et sans engagement. Si un délai exceptionnel se présente, je vous tiendrai informé.\n\nAprès réception, vous pourrez consulter la maquette, demander des ajustements jusqu’à ce qu’elle corresponde à vos attentes, puis choisir votre formule. Aucun paiement n’est demandé maintenant.\n\nJérôme — JL Studio Web\n27 boulevard de l’Université, 21000 Dijon\njerome.lopes21@gmail.com · 06 67 03 66 61`;
  return { subject: `Votre demande est bien reçue — JL Studio Web`, html, text };
}

function briefAdminEmail(brief) {
  const safe = value => escapeHtml(typeof value === 'string' ? value : JSON.stringify(value ?? '', null, 2));
  const photos = brief.photo_paths?.length ? `${brief.photo_paths.length} photo(s) ajoutée(s) en pièces jointes.` : 'Aucune photo jointe.';
  const text = `Nouvelle demande de maquette — ${brief.company_name}\nContact : ${brief.contact_name} · ${brief.contact_email} · ${brief.contact_phone || 'téléphone non renseigné'}\nFormule envisagée : ${brief.plan_interest || 'à définir'}\n${photos}\n\nRÉPONSES\n${JSON.stringify(brief.answers || {}, null, 2)}\n\nPROMPT À COPIER DANS CHATGPT\n${brief.generated_prompt || ''}`;
  const html = shell({
    preheader: `Nouveau brief reçu pour ${brief.company_name}. Le prompt et les photos sont inclus.`,
    title: `Nouveau brief — ${brief.company_name}`,
    body: `<h1 style="font-size:25px">Nouveau questionnaire reçu</h1><p style="color:#615d72;line-height:1.7"><strong>${safe(brief.company_name)}</strong> · ${safe(brief.contact_name)} · <a href="mailto:${encodeURIComponent(brief.contact_email)}">${safe(brief.contact_email)}</a> · ${safe(brief.contact_phone || 'Téléphone non renseigné')}</p><p>${safe(brief.plan_interest || 'Formule à définir')} · ${safe(photos)}</p><h2>Réponses au formulaire</h2><pre style="white-space:pre-wrap;background:#f7f6fa;padding:16px;border-radius:10px;font:13px/1.55 monospace">${safe(JSON.stringify(brief.answers || {}, null, 2))}</pre><h2>Prompt à copier dans ChatGPT</h2><pre style="white-space:pre-wrap;background:#f7f6fa;padding:16px;border-radius:10px;font:13px/1.55 monospace">${safe(brief.generated_prompt || '')}</pre><p>Le brief et les photos restent aussi consultables dans le tableau de bord.</p>`
  });
  return { subject: `Nouveau questionnaire — ${brief.company_name}`, html, text };
}

function previewReadyEmail(brief, previewUrl, expiresAt) {
  const name = escapeHtml(brief.contact_name || 'Bonjour');
  const company = escapeHtml(brief.company_name || 'votre activité');
  const safeUrl = escapeHtml(previewUrl);
  const expiry = new Date(expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const html = shell({
    preheader: `La maquette de ${brief.company_name} est prête à consulter.`,
    title: 'Votre maquette est prête',
    body: `<p style="margin:0 0 8px;color:#6957cf;font-weight:800;font-size:12px;letter-spacing:.12em">VOTRE MAQUETTE EST PRÊTE</p><h1 style="margin:0 0 14px;font-size:27px;line-height:1.2">${name}, découvrez votre première proposition.</h1><p style="color:#615d72;line-height:1.7">J’ai préparé un premier aperçu pour <strong>${company}</strong> à partir de vos réponses. Vous pouvez le consulter depuis le bouton ci-dessous.</p><p style="text-align:center;margin:25px 0"><a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#705ed5;color:#fff;text-decoration:none;font-weight:800">Voir ma maquette</a></p><div style="margin:20px 0;padding:16px 18px;border-radius:12px;background:#f5f3ff;color:#47415f;line-height:1.65">Les ajustements restent possibles sans facturation supplémentaire jusqu’à ce que le site corresponde à vos attentes. Vous pouvez me répondre directement à cet e-mail. Le lien de consultation est valable jusqu’au <strong>${escapeHtml(expiry)}</strong>.</div><p style="color:#615d72;line-height:1.7">Quand vous serez prêt, choisissez votre formule depuis le bouton violet présent sur la maquette. Le paiement ne sera demandé qu’après votre choix.</p><p style="font-size:12px;color:#858092;word-break:break-all">Si le bouton ne fonctionne pas, copiez ce lien : <a href="${safeUrl}" style="color:#6957cf">${safeUrl}</a></p>`
  });
  const text = `Bonjour ${brief.contact_name || ''},\n\nVotre première maquette pour ${brief.company_name} est prête. Consultez-la ici : ${previewUrl}\n\nLes ajustements restent possibles sans facturation supplémentaire jusqu’à ce que le site corresponde à vos attentes. Répondez à cet e-mail pour me transmettre vos retours. Le lien est valable jusqu’au ${expiry}.\n\nVous pourrez choisir une formule depuis le bouton violet présent dans la maquette. Aucun paiement n’est demandé avant ce choix.\n\nJérôme — JL Studio Web`;
  return { subject: `Votre maquette est prête — ${brief.company_name}`, html, text };
}

function officialSiteReadyEmail(client, officialUrl) {
  const name = escapeHtml(client.contact_name || 'Bonjour');
  const company = escapeHtml(client.company_name || 'votre activité');
  const safeUrl = escapeHtml(officialUrl);
  const subject = `Votre site officiel est en ligne — ${client.company_name}`;
  const text = `Bonjour ${client.contact_name || ''},\n\nVotre site officiel pour ${client.company_name} est en ligne : ${officialUrl}\n\nVous pouvez transmettre ce lien à vos clients et l’ajouter à vos supports de communication. Pour toute question ou évolution liée à votre formule, répondez simplement à cet e-mail.\n\nJérôme — JL Studio Web\nDijon, Bourgogne`;
  const html = shell({
    preheader: `Le site officiel de ${client.company_name} est en ligne.`,
    title: 'Votre site officiel est en ligne',
    body: `<p style="margin:0 0 8px;color:#6957cf;font-weight:800;font-size:12px;letter-spacing:.12em">VOTRE SITE EST EN LIGNE</p><h1 style="margin:0 0 14px;font-size:27px;line-height:1.2">${name}, votre site officiel est prêt.</h1><p style="color:#615d72;line-height:1.7">Le site de <strong>${company}</strong> est maintenant accessible à cette adresse :</p><p style="text-align:center;margin:25px 0"><a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#705ed5;color:#fff;text-decoration:none;font-weight:800">Voir mon site officiel</a></p><p style="font-size:12px;color:#858092;word-break:break-all">${safeUrl}</p><p style="color:#615d72;line-height:1.7">Vous pouvez partager ce lien avec vos clients et l’ajouter à vos supports de communication. Pour toute question ou évolution liée à votre formule, répondez simplement à cet e-mail.</p>`
  });
  return { subject, html, text };
}

function welcomeEmail(client, plan, firstAmountCents) {
  const name = escapeHtml(client.contact_name || 'Bonjour');
  const company = escapeHtml(client.company_name || 'votre activité');
  const monthly = (plan.monthly / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const creation = (plan.creation / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const firstAmount = (firstAmountCents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const html = shell({
    preheader: `Bienvenue chez JL Studio. Récapitulatif de votre formule ${plan.label}.`,
    title: 'Bienvenue chez JL Studio',
    body: `<p style="margin:0 0 8px;color:#6957cf;font-weight:800;font-size:12px;letter-spacing:.12em">BIENVENUE CHEZ JL STUDIO</p><h1 style="margin:0 0 14px;font-size:27px;line-height:1.2">${name}, merci pour votre confiance.</h1><p style="color:#615d72;line-height:1.7">Votre paiement a été confirmé et votre accompagnement pour <strong>${company}</strong> commence. Je reste votre interlocuteur pour la suite et pour les évolutions convenues de votre site vitrine.</p><div style="margin:20px 0;padding:18px;border:1px solid #e9e5f0;border-radius:13px"><strong>Récapitulatif de votre formule ${escapeHtml(plan.label)}</strong><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;color:#615d72;line-height:1.8"><tr><td>Création du site, facturée une fois</td><td align="right">${escapeHtml(creation)}</td></tr><tr><td>Abonnement mensuel</td><td align="right">${escapeHtml(monthly)} / mois</td></tr><tr><td style="padding-top:8px;border-top:1px solid #eee">Premier règlement confirmé</td><td align="right" style="padding-top:8px;border-top:1px solid #eee"><strong>${escapeHtml(firstAmount)}</strong></td></tr></table><p style="margin:9px 0 0;font-size:12px;color:#858092">Les échéances et reçus sont également disponibles dans les e-mails de facturation Stripe.</p></div><p style="color:#615d72;line-height:1.7">Pour une demande de résiliation, adressez un courrier recommandé avec accusé de réception à : <strong>JL Studio Web, 27 boulevard de l’Université, 21000 Dijon</strong>. La date de fin sera confirmée selon les conditions contractuelles applicables.</p><p style="color:#615d72;line-height:1.7">Une question ou une retouche ? Répondez à cet e-mail ; nous privilégions le suivi des clients déjà accompagnés.</p>`
  });
  const text = `Bonjour ${client.contact_name || ''},\n\nBienvenue chez JL Studio et merci pour votre confiance. Votre paiement pour ${client.company_name} a été confirmé.\n\nRécapitulatif — formule ${plan.label}\nCréation facturée une fois : ${creation}\nAbonnement : ${monthly} / mois\nPremier règlement confirmé : ${firstAmount}\n\nLes échéances et reçus sont également disponibles dans les e-mails de facturation Stripe.\n\nPour une demande de résiliation, adressez un courrier recommandé avec accusé de réception à JL Studio Web, 27 boulevard de l’Université, 21000 Dijon. La date de fin sera confirmée selon les conditions contractuelles applicables.\n\nPour une question ou une retouche, répondez à cet e-mail.\n\nJérôme — JL Studio Web`;
  return { subject: `Bienvenue chez JL Studio — ${company}`, html, text };
}

function inboundNotificationEmail(message) {
  const title = message.kind === 'correction' ? 'Demande de correction sur une maquette' : 'Nouveau message depuis le formulaire de contact';
  const fields = [
    ['Nom', message.name], ['Entreprise', message.company_name], ['Adresse e-mail', message.email],
    ['Téléphone', message.phone], ['Code postal', message.postal_code], ['Activité', message.activity],
    ['Moment souhaité', message.callback_time]
  ].filter(([, value]) => value);
  const rows = fields.map(([label, value]) => `<tr><td style="padding:5px 10px 5px 0;color:#777187">${escapeHtml(label)}</td><td style="padding:5px 0"><strong>${escapeHtml(value)}</strong></td></tr>`).join('');
  return {
    subject: `JL Studio — ${title}`,
    html: shell({ preheader: title, title, body: `<h1 style="font-size:24px">${escapeHtml(title)}</h1><table role="presentation" style="line-height:1.5">${rows}</table><div style="margin-top:20px;padding:16px;border-radius:12px;background:#f5f3ff;white-space:pre-wrap;line-height:1.65">${escapeHtml(message.message)}</div><p>Le message est aussi consultable dans le tableau de bord JL Studio.</p>` }),
    text: `${title}\n\n${fields.map(([label, value]) => `${label} : ${value}`).join('\n')}\n\nMessage :\n${message.message}`
  };
}

function inboundAcknowledgementEmail(message) {
  const name = escapeHtml(message.name || 'Bonjour');
  const correction = message.kind === 'correction';
  const title = correction ? 'Votre demande de correction est bien reçue' : 'Votre message est bien reçu';
  const text = `Bonjour ${message.name || ''},\n\n${correction ? 'J’ai bien reçu votre demande de correction pour la maquette. Je vais en prendre connaissance et reviendrai vers vous.' : 'J’ai bien reçu votre message. Je vais en prendre connaissance et reviendrai vers vous dans les meilleurs délais.'}\n\nJérôme — JL Studio Web\nDijon, Bourgogne`;
  return { subject: `${title} — JL Studio Web`, text, html: shell({ preheader: title, title, body: `<h1 style="font-size:25px">${name}, ${escapeHtml(title.toLowerCase())}.</h1><p style="color:#615d72;line-height:1.7">${correction ? 'J’ai bien reçu votre demande concernant votre maquette. Je vais en prendre connaissance et reviendrai vers vous.' : 'J’ai bien reçu votre message. Je vais en prendre connaissance et reviendrai vers vous dans les meilleurs délais.'}</p>` }) };
}

async function recordSentEmail({ briefId, clientId, to, category, subject, text, providerId }) {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/client_emails`, {
      method: 'POST', headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ brief_id: briefId || null, client_id: clientId || null, recipient_email: to, category, subject, body_text: String(text || '').slice(0, 12000), provider_message_id: providerId || null, status: 'sent' })
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    return true;
  } catch (error) {
    console.error('Historique du courriel non enregistré:', error.message);
    return false;
  }
}

async function sendTransactionalEmail({ to, subject, html, text, idempotencyKey, replyTo, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Email transactionnel non configuré : ajoutez RESEND_API_KEY et RESEND_FROM_EMAIL dans Vercel.');
  const payload = { from, to: [to], subject, html, text };
  if (attachments?.length) payload.attachments = attachments;
  const reply = replyTo || process.env.RESEND_REPLY_TO;
  if (reply) payload.reply_to = reply;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `jlstudio-${idempotencyKey}` },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) throw new Error(result.message || result.error || `Le prestataire e-mail a refusé le message (${response.status}).`);
  return result.id;
}

module.exports = { sendTransactionalEmail, receivedEmail, briefAdminEmail, previewReadyEmail, officialSiteReadyEmail, welcomeEmail, inboundNotificationEmail, inboundAcknowledgementEmail, recordSentEmail };
