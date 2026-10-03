import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return <div className={`markdown ${className}`}><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children: text, ...props }) => <a {...props} target="_blank" rel="noreferrer">{text}</a>, table: ({ children: rows, ...props }) => <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabla de contenido, desplazable horizontalmente"><table {...props}>{rows}</table></div> }}>{children}</ReactMarkdown></div>;
}
