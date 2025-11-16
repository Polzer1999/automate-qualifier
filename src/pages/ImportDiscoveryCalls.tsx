import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Upload, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const ImportDiscoveryCalls = () => {
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: number } | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      // Read file content
      const text = await file.text();
      
      // Call the import edge function
      const { data, error } = await supabase.functions.invoke('import-discovery-calls', {
        body: { csvData: text }
      });

      if (error) throw error;

      setResult(data);
      toast.success(`Import réussi ! ${data.imported} appels importés`);
      
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Erreur lors de l\'import du fichier');
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('discovery_calls_knowledge')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
      
      if (error) throw error;
      
      toast.success('Tous les imports ont été supprimés');
      setResult(null);
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Import des appels de découverte</CardTitle>
              <CardDescription>
                Importez le fichier CSV contenant vos 103 appels de découverte pour enrichir Parrit avec votre méthode de qualification.
              </CardDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={deleting}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleting ? 'Suppression...' : 'Supprimer tout'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer tous les imports ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action supprimera définitivement tous les appels de découverte importés. 
                    Vous pourrez réimporter le fichier CSV par la suite.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Button disabled={importing} asChild>
                <span>
                  {importing ? 'Import en cours...' : 'Sélectionner le fichier CSV'}
                </span>
              </Button>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
                disabled={importing}
              />
            </label>
            <p className="mt-2 text-sm text-muted-foreground">
              Format attendu: Comment_découvrir_-_Super_Paul.csv
            </p>
          </div>

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="font-medium text-green-900 dark:text-green-100">
                    {result.imported} appels importés avec succès
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Parrit peut maintenant utiliser votre méthode de qualification
                  </p>
                </div>
              </div>
              
              {result.errors > 0 && (
                <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                  <XCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  <div>
                    <p className="font-medium text-orange-900 dark:text-orange-100">
                      {result.errors} lignes ignorées
                    </p>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      Vérifiez les logs pour plus de détails
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h3 className="font-semibold text-sm">Comment ça marche ?</h3>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Parrit analyse vos 103 appels de découverte</li>
              <li>Détecte automatiquement le secteur et le besoin du prospect</li>
              <li>Trouve les 3 appels les plus similaires dans votre historique</li>
              <li>Adapte ses questions en fonction de votre méthode</li>
              <li>Qualifie exactement comme vous le feriez</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ImportDiscoveryCalls;
