#!/bin/sh
set -eu

deploy_user=autolister-deploy
deploy_home=/home/$deploy_user

if ! id "$deploy_user" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$deploy_user"
fi

install -d -m 700 -o "$deploy_user" -g "$deploy_user" "$deploy_home/.ssh"
install -m 600 -o "$deploy_user" -g "$deploy_user" /root/.ssh/authorized_keys "$deploy_home/.ssh/authorized_keys"
printf '%s\n' "$deploy_user ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/$deploy_user"
chmod 440 "/etc/sudoers.d/$deploy_user"
visudo -cf "/etc/sudoers.d/$deploy_user"
sshd -t
systemctl reload ssh
echo DEPLOY-USER-TAMAM
