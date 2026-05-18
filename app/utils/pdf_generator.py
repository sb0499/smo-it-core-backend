from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet

def generar_acta_movimiento(movimiento) -> BytesIO:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    elementos = []
    estilos = getSampleStyleSheet()

    persona = movimiento.persona_recibe
    activo = movimiento.activo
    fecha_formateada = movimiento.fecha.strftime('%Y-%m-%d %H:%M')

    titulo = Paragraph("<b>ACTA DE ENTREGA DE EQUIPO</b>", estilos['Title'])
    elementos.append(titulo)
    elementos.append(Spacer(1, 20))

    datos_transaccion = f"""
    <b>Fecha de Entrega:</b> {fecha_formateada}<br/>
    <b>Entregado a:</b> {persona.nombre_completo if hasattr(persona, 'nombre_completo') else persona.nombre} (C.I. {persona.cedula})<br/>
    <b>Tipo de Movimiento:</b> {movimiento.tipo}<br/>
    <b>Empresa:</b> {persona.empresa.nombre if hasattr(persona, 'empresa') else 'N/A'}<br/>
    <b>Ticket/Obs:</b> {movimiento.observaciones or 'N/A'}
    """
    elementos.append(Paragraph(datos_transaccion, estilos['Normal']))
    elementos.append(Spacer(1, 20))

    datos_tabla = [
        ["CÓDIGO", "MARCA", "MODELO", "SERIAL"],
        [activo.codigo, activo.marca, activo.modelo, activo.serial]
    ]
    
    tabla = Table(datos_tabla, colWidths=[100, 100, 150, 150])
    tabla.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#2C3E50")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor("#ECF0F1")),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    elementos.append(tabla)
    elementos.append(Spacer(1, 30))

    clausula = f"""
    Mediante la presente acta, confirmo la recepción del equipo detallado anteriormente en perfectas 
    condiciones de funcionamiento. Me comprometo a darle un uso estrictamente laboral, reportar cualquier 
    anomalía al departamento de TI y devolverlo en las mismas condiciones al momento de mi desvinculación 
    o cuando la empresa lo requiera.
    """
    elementos.append(Paragraph(clausula, estilos['Normal']))
    elementos.append(Spacer(1, 60))

    datos_firmas = [
        ["___________________________", "___________________________"],
        [f"Recibe: {persona.nombre if hasattr(persona, 'nombre') else 'Empleado'}", "Entrega: Dpto. de TI"],
        [f"C.I. {persona.cedula}", ""]
    ]
    tabla_firmas = Table(datos_firmas, colWidths=[250, 250])
    tabla_firmas.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER')]))
    elementos.append(tabla_firmas)

    doc.build(elementos)
    buffer.seek(0)
    
    return buffer