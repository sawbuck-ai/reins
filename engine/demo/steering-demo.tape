# vhs tape for the steering sim. Render on a machine with vhs:  vhs steering-demo.tape
# (deterministic: it drives our own canned-fixture sim, not a live agent). Produces steering-demo.gif.
Output steering-demo.gif

Set Theme "Catppuccin Mocha"
Set FontSize 15
Set Width 1120
Set Height 760
Set Padding 24

Type "./steering-demo.sh"  Sleep 400ms  Enter
Sleep 15s
