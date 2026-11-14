@echo off
REM Final Verda teardown: delete every bayes-* VM and its volumes in the active (junction26)
REM profile before the 11:00 Helsinki credit deadline. Output goes to results\teardown.log.
set LOG=%~dp0..\results\teardown.log
echo [%date% %time%] teardown start >> "%LOG%"
"%USERPROFILE%\scoop\shims\verda.exe" --agent vm delete --all --hostname "bayes-*" --with-volumes --yes --wait -o json --base-url https://api.datacrunch.io/v1 >> "%LOG%" 2>&1
"%USERPROFILE%\scoop\shims\verda.exe" --agent vm list -o json --base-url https://api.datacrunch.io/v1 >> "%LOG%" 2>&1
echo [%date% %time%] teardown end >> "%LOG%"
