' Dispara a analise da Entretec sem abrir janela de console.
' O Agendador chama este .vbs; ele roda o rodar.cmd em janela oculta (0) e espera terminar.
Set sh = CreateObject("WScript.Shell")
base = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
WScript.Quit sh.Run("cmd /c """ & base & "rodar.cmd""", 0, True)
