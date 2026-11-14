import re,subprocess,sys
for f in sys.argv[1:]:
    o=subprocess.check_output(['pdfinfo','-box',f]).decode()
    m=re.search(r'MediaBox:\s+([\d. ]+)',o).group(1).split()
    w=float(m[2])-float(m[0]);h=float(m[3])-float(m[1])
    print(f,'pt',w,h,'mm %.3f x %.3f'%(w/72*25.4,h/72*25.4),'delta mm %+.3f %+.3f'%(w/72*25.4-216,h/72*25.4-303))
