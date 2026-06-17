; Dragon Client Custom NSIS Installer Header
; Dark theme - minimal text

; Custom welcome text
!define MUI_WELCOMEPAGE_TITLE "Welcome"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "This will install Dragon Client on your computer.$\r$\n$\r$\nClick Next to continue."

; Finish page
!define MUI_FINISHPAGE_TITLE "Installation Complete"
!define MUI_FINISHPAGE_TEXT "Dragon Client has been installed successfully."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${MAINBINARYNAME}.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Dragon Client"
