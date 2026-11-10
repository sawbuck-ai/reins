# Evals for sawbuck-reins

Run from the plugin folder (it runs real model calls on your account; the fixture scripts build small git repos):

    claude plugin eval . --scaffold --allow-tools "Bash(npx -y sawbuck@*)" --runs 2 --no-publish

Cases: the check skill fires and calls a test edit gamed; it fires and calls a real fix earned; it stays quiet on an
unrelated ask; the steering skill fires on a steering question.

Last run (2026-11-10, Sonnet, 2 runs a case): the steering skill fired 2 of 2 on a plain steering question (0 of 2 without
the plugin); nothing fired on an unrelated ask (4 of 4); the check skill fired 0 of 4 on "confirm the win is real" until its
description named that phrasing, then 4 of 4, and called the test edit not real 2 of 2. The real-fix verdict needs the
shell grant: on Ubuntu the eval sandbox (bubblewrap) is blocked by AppArmor until
`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` or bubblewrap's AppArmor profile.

