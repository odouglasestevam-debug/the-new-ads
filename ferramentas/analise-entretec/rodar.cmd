@echo off
REM Analise agendada da conta Google Ads da Entretec.
REM Chamado pelo Agendador de Tarefas do Windows (tercas e sextas).
cd /d "C:\Users\odoug\OneDrive\Documentos\the new ads"
python "ferramentas\analise-entretec\analise.py" >> "clientes\entretec\relatorios\_saida.log" 2>&1
exit /b %ERRORLEVEL%
