; Margins for Windows: extra installer steps (electron-builder includes this file).
; margins://app links (sign-in emails, Google sign-in) open the program. The
; program also registers itself when it starts; the uninstaller removes it.

!macro customInstall
  WriteRegStr HKCU "Software\Classes\margins" "" "URL:Margins"
  WriteRegStr HKCU "Software\Classes\margins" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\margins\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\margins\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\margins"
!macroend
