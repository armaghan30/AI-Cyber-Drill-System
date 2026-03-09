import yaml


class YAMLLoader:

    def __init__(self, file_path):
        self.file_path = file_path

    def load_yaml(self):
        try:
            with open(self.file_path, "r") as f:
                data = yaml.safe_load(f)
            return data
        except Exception as e:
            raise Exception(f"Error loading YAML: {e}")

    def validate(self, data):
        if "network" not in data:
            raise ValueError(" YAML must contain 'network' section")

        if "hosts" not in data["network"]:
            raise ValueError("YAML must define hosts")

        return True

    def parse(self):
        data = self.load_yaml()
        self.validate(data)
        return data
